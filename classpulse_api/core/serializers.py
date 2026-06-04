from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Course, QuizSession, Question, Response

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']

class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['id', 'name', 'professor']

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'session', 'text', 'type', 'options']

class QuizSessionSerializer(serializers.ModelSerializer):
    # We include nested serialized details of the current active question
    active_questions = serializers.SerializerMethodField()

    class Meta:
        model = QuizSession
        fields = ['id', 'course', 'access_code', 'is_active', 'created_at', 'active_questions']
        read_only_fields = ['access_code', 'is_active']

    def get_active_questions(self, obj):
        questions = Question.objects.filter(session=obj)
        return QuestionSerializer(questions, many=True).data

class ResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Response
        fields = ['id', 'question', 'student_name', 'answer_data', 'submitted_at']

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'first_name', 'last_name']

    def create(self, validated_data):
        # Uses Django's secure built-in hashing algorithm to safely encrypt passwords
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        return user