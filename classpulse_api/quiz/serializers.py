from rest_framework import serializers
from .models import Quiz, Question, Submission

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'order_index', 'question_title', 'question_type', 'question_text', 'interaction_data']

class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True)

    class Meta:
        model = Quiz
        fields = ['id', 'title', 'time_limit_minutes', 'instructions', 'access_code', 'status', 'questions', 'created_at']

    def create(self, validated_data):
        questions_data = validated_data.pop('questions')
        quiz = Quiz.objects.create(**validated_data)
        for question_data in questions_data:
            Question.objects.create(quiz=quiz, **question_data)
        return quiz


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ['id', 'quiz', 'student_name', 'answers', 'score', 'total_possible', 'submitted_at']
        read_only_fields = ['score', 'total_possible', 'submitted_at']


class SubmissionCreateSerializer(serializers.ModelSerializer):
    answers = serializers.ListField(child=serializers.DictField(), allow_empty=True)

    class Meta:
        model = Submission
        fields = ['quiz', 'student_name', 'answers']

    def validate_answers(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Answers must be a list of question answer objects.')
        return value

