<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): mixed
    {
        $header = $request->header('Authorization', '');

        if (! str_starts_with($header, 'Bearer ')) {
            return new JsonResponse(['message' => 'Unauthenticated.'], 401);
        }

        $plainTextToken = trim(substr($header, 7));
        $token = ApiToken::query()
            ->with('user')
            ->where('token_hash', hash('sha256', $plainTextToken))
            ->first();

        if (! $token || ($token->expires_at && $token->expires_at->isPast())) {
            return new JsonResponse(['message' => 'Invalid or expired token.'], 401);
        }

        $token->forceFill(['last_used_at' => now()])->save();
        $request->setUserResolver(fn () => $token->user);
        $request->attributes->set('currentAccessToken', $token);

        return $next($request);
    }
}
