from django.urls import path
from .views import StartSessionView, JoinSessionView, SubmitResponseView

urlpatterns = [
    path('session/start/', StartSessionView.as_view(), name='start-session'),
    path('session/join/', JoinSessionView.as_view(), name='join-session'),
    path('response/submit/', SubmitResponseView.as_view(), name='submit-response'),
]