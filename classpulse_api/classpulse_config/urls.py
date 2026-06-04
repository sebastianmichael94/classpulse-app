from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),  # Fixed standard admin path
    path('api/', include('core.urls')),  # Routes everything to our core application endpoints
]