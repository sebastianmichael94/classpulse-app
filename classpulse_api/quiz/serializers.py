from rest_framework import serializers
from .models import Quiz, Question, Submission, PeerResponse
from .choice_schema import find_choice_index, normalize_choice_list
from .matching_schema import normalize_correct_mapping, normalize_matching_items


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=['student', 'professor'])
    security_question = serializers.ChoiceField(
        choices=['first_pet', 'birth_city', 'first_school'],
        required=False,
        allow_null=True,
    )
    security_answer = serializers.CharField(max_length=255, required=False, allow_blank=True)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)

class QuestionSerializer(serializers.ModelSerializer):
    question_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ['id', 'order_index', 'question_title', 'question_type', 'question_text', 'question_image', 'question_image_url', 'interaction_data', 'allow_peer_upvoting']

    def _is_option_type(self, question_type):
        normalized = str(question_type or '').strip()
        return normalized in {
            'Multiple Choice',
            'True/False',
            'multiple_choice_question',
            'true_false_question',
        }

    def _is_true_false_type(self, question_type):
        normalized = str(question_type or '').strip()
        return normalized in {'True/False', 'true_false_question'}

    def _is_matching_type(self, question_type):
        normalized = str(question_type or '').strip()
        return normalized in {'Matching', 'matching_question'}

    def _resolve_correct_index(self, raw_value, choices, fallback_index=0):
        if raw_value is None:
            return fallback_index

        resolved_index = find_choice_index(raw_value, choices)
        if isinstance(resolved_index, int):
            return resolved_index

        raw_text = str(raw_value or '').strip()
        if raw_text.isdigit():
            numeric_index = int(raw_text)
            if 0 <= numeric_index < len(choices):
                return numeric_index

        return None

    def _resolve_correct_indices(self, raw_values, choices):
        values = raw_values if isinstance(raw_values, list) else []
        resolved = []

        for raw_value in values:
            resolved_index = find_choice_index(raw_value, choices)
            if isinstance(resolved_index, int) and resolved_index not in resolved:
                resolved.append(resolved_index)
                continue

            raw_text = str(raw_value or '').strip()
            if raw_text.isdigit():
                numeric_index = int(raw_text)
                if 0 <= numeric_index < len(choices) and numeric_index not in resolved:
                    resolved.append(numeric_index)

        return sorted(resolved)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        question_type = attrs.get('question_type') or getattr(self.instance, 'question_type', None)
        interaction_data = attrs.get('interaction_data')
        if interaction_data is None and self.instance is not None:
            interaction_data = getattr(self.instance, 'interaction_data', {})
        interaction = interaction_data if isinstance(interaction_data, dict) else {}

        if self._is_option_type(question_type):
            choices = normalize_choice_list(
                interaction.get('options'),
                default_true_false=self._is_true_false_type(question_type),
            )

            if len(choices) < 2:
                raise serializers.ValidationError({'interaction_data': 'At least 2 choices are required.'})

            if any(not str(choice.get('text') or '').strip() for choice in choices):
                raise serializers.ValidationError({'interaction_data': 'Each choice must include non-empty text.'})

            interaction['options'] = choices

            if str(question_type or '').strip() in {'Multiple Choice', 'True/False', 'multiple_choice_question', 'true_false_question'}:
                raw_correct = interaction.get('correct_index', interaction.get('correct_option'))
                resolved_index = self._resolve_correct_index(raw_correct, choices, fallback_index=0)
                if resolved_index is None:
                    raise serializers.ValidationError({'interaction_data': 'correct_index must reference a valid choice.'})
                interaction['correct_index'] = resolved_index
                interaction.pop('correct_option', None)

            attrs['interaction_data'] = interaction

        if self._is_matching_type(question_type):
            left_items = normalize_matching_items(interaction.get('left_items'), prefix='L')
            right_options = normalize_matching_items(interaction.get('right_options'), prefix='R')

            if len(left_items) < 2:
                raise serializers.ValidationError({'interaction_data': 'Matching questions require at least 2 left items.'})

            if len(right_options) < len(left_items):
                raise serializers.ValidationError({'interaction_data': 'right_options must contain at least as many items as left_items.'})

            if any(not str(item.get('text') or '').strip() for item in left_items):
                raise serializers.ValidationError({'interaction_data': 'Each left item must include non-empty text.'})

            if any(not str(item.get('text') or '').strip() for item in right_options):
                raise serializers.ValidationError({'interaction_data': 'Each right option must include non-empty text.'})

            normalized_mapping = normalize_correct_mapping(
                interaction.get('correct_mapping'),
                left_items,
                right_options,
            )

            if any(value is None for value in normalized_mapping.values()) or len(normalized_mapping) != len(left_items):
                raise serializers.ValidationError({'interaction_data': 'correct_mapping must map every left item id to a valid right option id.'})

            interaction['left_items'] = left_items
            interaction['right_options'] = right_options
            interaction['correct_mapping'] = normalized_mapping
            attrs['interaction_data'] = interaction

        return attrs

    def get_question_image_url(self, obj):
        if not obj.question_image:
            return None

        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.question_image)
        return obj.question_image

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        question_type = representation.get('question_type')
        interaction_data = representation.get('interaction_data')
        interaction = interaction_data if isinstance(interaction_data, dict) else {}

        if self._is_option_type(question_type):
            source_interaction = instance.interaction_data if isinstance(instance.interaction_data, dict) else {}
            interaction['options'] = normalize_choice_list(
                source_interaction.get('options'),
                default_true_false=self._is_true_false_type(question_type),
            )
            representation['interaction_data'] = interaction

        if self._is_matching_type(question_type):
            source_interaction = instance.interaction_data if isinstance(instance.interaction_data, dict) else {}
            left_items = normalize_matching_items(source_interaction.get('left_items'), prefix='L')
            right_options = normalize_matching_items(source_interaction.get('right_options'), prefix='R')
            interaction['left_items'] = left_items
            interaction['right_options'] = right_options
            interaction['correct_mapping'] = normalize_correct_mapping(
                source_interaction.get('correct_mapping'),
                left_items,
                right_options,
            )
            representation['interaction_data'] = interaction

        return representation

class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True)

    class Meta:
        model = Quiz
        fields = [
            'id',
            'title',
            'time_limit_minutes',
            'duration_minutes',
            'started_at',
            'instructions',
            'access_code',
            'status',
            'is_shared_with_students',
            'shared_insight_text',
            'shared_insight_updated_at',
            'questions',
            'created_at',
        ]

    def create(self, validated_data):
        questions_data = validated_data.pop('questions')
        quiz = Quiz.objects.create(**validated_data)
        for question_data in questions_data:
            Question.objects.create(quiz=quiz, **question_data)
        return quiz


class SubmissionSerializer(serializers.ModelSerializer):
    answer_records = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = ['id', 'quiz', 'student_name', 'answers', 'answer_records', 'score', 'total_possible', 'submitted_at']
        read_only_fields = ['score', 'total_possible', 'submitted_at']

    def get_answer_records(self, obj):
        records = []
        answer_items = obj.answers if isinstance(obj.answers, list) else []

        for answer_item in answer_items:
            if not isinstance(answer_item, dict):
                continue

            answer_value = answer_item.get('answer')
            answer_text = ''
            answer_id = None

            if isinstance(answer_value, dict):
                answer_text = ' | '.join([
                    str(value).strip()
                    for value in answer_value.values()
                    if str(value).strip()
                ])
            elif isinstance(answer_value, list):
                flattened = [str(value).strip() for value in answer_value if str(value).strip()]
                answer_text = ', '.join(flattened)
                answer_id = flattened if flattened else None
            else:
                answer_text = str(answer_value or '').strip()
                answer_id = str(answer_value).strip() if str(answer_value or '').strip() else None

            records.append({
                'question_id': answer_item.get('question_id'),
                'answer_text': answer_text,
                'answer_id': answer_id,
                'question_type': answer_item.get('question_type'),
            })

        return records


class SubmissionCreateSerializer(serializers.ModelSerializer):
    answers = serializers.ListField(child=serializers.DictField(), allow_empty=True)

    class Meta:
        model = Submission
        fields = ['quiz', 'student_name', 'answers']

    def validate_answers(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Answers must be a list of question answer objects.')
        return value


class PeerResponseSerializer(serializers.ModelSerializer):
    has_upvoted = serializers.SerializerMethodField()

    class Meta:
        model = PeerResponse
        fields = [
            'id',
            'quiz',
            'question',
            'student_name',
            'response_text',
            'upvote_count',
            'has_upvoted',
            'created_at',
        ]

    def get_has_upvoted(self, obj):
        student_name = self.context.get('student_name')
        if not student_name:
            return False
        return student_name in (obj.upvoted_by or [])

