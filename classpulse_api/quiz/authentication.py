from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed


class BearerOrTokenAuthentication(TokenAuthentication):
    keyword = 'Bearer'
    token_ttl = timedelta(hours=24)

    def authenticate(self, request):
        auth_header = get_authorization_header(request).split()
        if not auth_header:
            return None

        if auth_header[0].lower() == b'token':
            self.keyword = 'Token'
        else:
            self.keyword = 'Bearer'

        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result
        if token.created < timezone.now() - self.token_ttl:
            raise AuthenticationFailed('Authentication token has expired. Please sign in again.')

        return (user, token)
