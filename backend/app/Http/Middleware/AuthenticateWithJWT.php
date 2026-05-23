<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\JWTService;
use Closure;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateWithJWT
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Support stateful actingAs() authentication context for automated tests
        if (Auth::check() || $request->user()) {
            $user = $request->user() ?: Auth::user();
            if ($user && !$user->is_active) {
                return response()->json([
                    'message' => 'Votre compte a été désactivé.',
                ], 403);
            }
            if ($user) {
                Auth::setUser($user);
            }
            return $next($request);
        }

        $authorization = $request->header('Authorization');

        if (!$authorization || !str_starts_with($authorization, 'Bearer ')) {
            return response()->json([
                'message' => 'Non authentifié. Jeton d\'accès manquant.',
            ], 401);
        }

        $token = substr($authorization, 7);

        try {
            $payload = JWTService::decode($token);
            
            if (!isset($payload['sub'])) {
                throw new Exception('Sujet du jeton manquant.');
            }

            $user = User::query()->find($payload['sub']);

            if (!$user) {
                throw new Exception('Utilisateur inexistant.');
            }

            if (!$user->is_active) {
                return response()->json([
                    'message' => 'Votre compte a été désactivé.',
                ], 403);
            }

            // Authenticate the user statefully for this specific request
            Auth::setUser($user);

            return $next($request);
        } catch (Exception $e) {
            return response()->json([
                'message' => 'Non authentifié. ' . $e->getMessage(),
                'code' => 'TOKEN_EXPIRED_OR_INVALID',
            ], 401);
        }
    }
}
