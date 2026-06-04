from django.urls import path
from .views import StartSessionView, JoinSessionView, SubmitResponseView, RegisterView, LoginView

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('session/start/', StartSessionView.as_view(), name='start-session'),
    path('session/join/', JoinSessionView.as_view(), name='join-session'),
    path('response/submit/', SubmitResponseView.as_view(), name='submit-response'),
]