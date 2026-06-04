from rest_framework.views import APIView
from rest_framework.response import Response as APIResponse
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Course, QuizSession, Question, Response as StudentResponse
from .serializers import QuizSessionSerializer, QuestionSerializer, ResponseSerializer
from .utils import generate_unique_access_code

class StartSessionView(APIView):
    """
    Endpoint for Dr. Reshma to open a live lecture room session.
    POST request needs: {"course_id": 1}
    """
    def post(self, request):
        course_id = request.data.get('course_id')
        course = get_object_or_404(Course, id=course_id)
        
        # Deactivate any previous old sessions for this course to keep things clean
        QuizSession.objects.filter(course=course, is_active=True).update(is_active=False)
        
        # Generate our unique, clean 4-digit code
        code = generate_unique_access_code()
        
        session = QuizSession.objects.create(
            course=course,
            access_code=code,
            is_active=True
        )
        
        serializer = QuizSessionSerializer(session)
        return APIResponse(serializer.data, status=status.HTTP_201_CREATED)

class JoinSessionView(APIView):
    """
    Endpoint for Students to enter a live lecture room.
    POST request needs: {"access_code": "B7X2"}
    """
    def post(self, request):
        code = request.data.get('access_code', '').strip().upper()
        
        # Look for a session that matches the typed code and is currently active
        session = QuizSession.objects.filter(access_code=code, is_active=True).first()
        
        if not session:
            return APIResponse(
                {"error": "Invalid or expired session access code."}, 
                status=status.HTTP_404_NOT_FOUND
            )
            
        serializer = QuizSessionSerializer(session)
        return APIResponse(serializer.data, status=status.HTTP_200_OK)

class SubmitResponseView(APIView):
    """
    Endpoint for Students to submit their quiz answers.
    POST request needs: {"question_id": 1, "student_name": "Alex", "answer_data": {"choice": "A"}}
    """
    def post(self, request):
        serializer = ResponseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return APIResponse({"message": "Response submitted successfully!"}, status=status.HTTP_201_CREATED)
        return APIResponse(serializer.errors, status=status.HTTP_400_BAD_REQUEST)