from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from quiz.views import (
    QuizViewSet,
    SubmissionViewSet,
    RegisterView,
    LoginView,
    ProfessorQuizHistoryView,
    CustomAnalyticsPromptView,
    ShareCustomAnalyticsPromptView,
    QuestionPeerResponsesView,
    PeerResponseUpvoteView,
    QuestionImageUploadView,
)

# Setup the DRF router for viewsets
router = DefaultRouter()
router.register(r'quizzes', QuizViewSet, basename='quiz')
router.register(r'submissions', SubmissionViewSet, basename='submission')

urlpatterns = [
    path('admin/', admin.site.urls),       # Cleaned this line up
    path('api/auth/register/', RegisterView.as_view()),
    path('api/auth/login/', LoginView.as_view()),
    path('api/professor/quizzes/history/', ProfessorQuizHistoryView.as_view()),
    path('api/custom-analytics-prompt/', CustomAnalyticsPromptView.as_view()),
    path('api/custom-analytics-prompt/share/', ShareCustomAnalyticsPromptView.as_view()),
    path('api/assets/question-image/', QuestionImageUploadView.as_view()),
    path('api/quizzes/<uuid:quiz_id>/questions/<int:question_id>/responses/', QuestionPeerResponsesView.as_view()),
    path('api/responses/<int:response_id>/upvote/', PeerResponseUpvoteView.as_view()),
    path('api/', include(router.urls)),    # Includes all automatic viewset routes
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)