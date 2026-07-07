from rest_framework import serializers
from .models import Quiz, Question, Submission, PeerResponse


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

    def get_question_image_url(self, obj):
        if not obj.question_image:
            return None

        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.question_image)
        return obj.question_image

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

