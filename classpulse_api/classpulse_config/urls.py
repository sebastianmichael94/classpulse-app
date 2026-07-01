from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from quiz.views import QuizViewSet, SubmissionViewSet

# Setup the DRF router for viewsets
router = DefaultRouter()
router.register(r'quizzes', QuizViewSet, basename='quiz')
router.register(r'submissions', SubmissionViewSet, basename='submission')

urlpatterns = [
    path('admin/', admin.site.urls),       # Cleaned this line up
    path('api/', include(router.urls)),    # Includes all automatic viewset routes
]