from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Quiz
from .serializers import QuizSerializer

class QuizViewSet(viewsets.ModelViewSet):
    queryset = Quiz.objects.all()
    serializer_with_nested = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer

    # Endpoints to allow student unlocking via access pin validation
    @action(detail=False, methods=['post'], url_path='unlock')
    def unlock_quiz(self, request):
        code = request.data.get('access_code')
        if not code:
            return Response({"error": "Access code required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            quiz = Quiz.objects.get(access_code=code, status='PUBLISHED')
            serializer = self.get_serializer(quiz)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Quiz.DoesNotExist:
            return Response({"error": "Invalid access code or quiz is not published yet."}, status=status.HTTP_404_NOT_FOUND)