from rest_framework import serializers
from .models import Quiz, Question

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['order_index', 'question_title', 'question_type', 'question_text', 'interaction_data']

class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True)

    class Meta:
        model = Quiz
        fields = ['id', 'title', 'time_limit_minutes', 'instructions', 'access_code', 'status', 'questions', 'created_at']

    def create(self, validated_data):
        questions_data = validated_data.pop('questions')
        # Create the overarching parent Quiz record
        quiz = Quiz.objects.create(**validated_data)
        
        # Sequentially bulk insert the underlying nested questions
        for question_data in questions_data:
            Question.objects.create(quiz=quiz, **question_data)
        return quiz