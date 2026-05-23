<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ApiToken;
use App\Services\JWTService;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    /**
     * Public Registration
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => [
                'required', 
                'confirmed', 
                Password::min(8)
                    ->letters()
                    ->mixedCase()
                    ->numbers()
                    ->symbols()
            ],
            'phone' => ['nullable', 'string', 'max:30'],
            'year_level' => ['nullable', 'in:1,2'],
            'option' => ['nullable', 'in:Full Stack,Mobile,RV/RA'],
        ], [
            'first_name.required' => 'Le prénom est obligatoire.',
            'last_name.required' => 'Le nom est obligatoire.',
            'email.required' => 'L’adresse e-mail est obligatoire.',
            'email.email' => 'Veuillez saisir une adresse e-mail valide.',
            'email.unique' => 'Un compte existe déjà avec cette adresse e-mail.',
            'password.required' => 'Le mot de passe est obligatoire.',
            'password.confirmed' => 'La confirmation du mot de passe ne correspond pas.',
            'password.min' => 'Le mot de passe doit contenir au moins 8 caractères.',
            'password.letters' => 'Le mot de passe doit contenir au moins une lettre.',
            'password.mixed' => 'Le mot de passe doit contenir à la fois des majuscules et des minuscules.',
            'password.numbers' => 'Le mot de passe doit contenir au moins un chiffre.',
            'password.symbols' => 'Le mot de passe doit contenir au moins un caractère spécial.',
            'year_level.in' => 'L’année d’études sélectionnée est invalide.',
            'option.in' => 'L’option sélectionnée est invalide.',
        ]);

        $phone = $data['phone'] ?? null;
        $year = $data['year_level'] ?? '1';
        $opt = $data['option'] ?? null;

        if ($year === '2') {
            $optionStr = $opt ?: 'Full Stack';
            $specialty = "Développement digital - 2ème année - {$optionStr}";
        } else {
            $specialty = "Développement digital - 1ère année";
        }

        $user = User::query()->create([
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
            'email' => strtolower(trim($data['email'])),
            'role' => 'trainee',
            'is_active' => true,
            'phone' => $phone,
            'specialty' => $specialty,
            'bio' => null,
            'password' => Hash::make($data['password']),
        ]);

        // Secure UX requirement: Do NOT log in automatically, redirect to login page.
        return response()->json([
            'message' => 'Inscription réussie ! Veuillez vous connecter avec vos identifiants.',
            'redirect_to' => '/login',
            'user' => $this->serializeUser($user),
        ], 201);
    }

    /**
     * Stateless JWT Login
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ], [
            'email.required' => 'L’adresse e-mail est obligatoire.',
            'email.email' => 'Veuillez saisir une adresse e-mail valide.',
            'password.required' => 'Le mot de passe est obligatoire.',
        ]);

        $user = User::query()->where('email', strtolower(trim($credentials['email'])))->first();

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Les identifiants fournis sont incorrects.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Votre compte a été désactivé. Veuillez contacter l’administrateur.'],
            ]);
        }

        // Generate stateless JWT tokens
        $accessToken = JWTService::generate([
            'sub' => $user->id,
            'role' => $user->role,
            'email' => $user->email,
        ], 900); // Access token expires in 15 minutes

        $refreshToken = JWTService::generate([
            'sub' => $user->id,
            'type' => 'refresh',
        ], 604800); // Refresh token expires in 7 days

        // Store refresh token hash securely in database (prevents plain-text DB leak theft)
        ApiToken::query()->create([
            'user_id' => $user->id,
            'name' => 'refresh_token',
            'token_hash' => hash('sha256', $refreshToken),
            'expires_at' => now()->addDays(7),
        ]);

        $isSecure = app()->environment('production', 'staging');

        return response()->json([
            'message' => 'Connexion réussie.',
            'access_token' => $accessToken,
            'token_type' => 'bearer',
            'refresh_token' => $refreshToken, // kept for client-side backward compatibility
            'user' => $this->serializeUser($user),
        ])->cookie(
            'edudev_refresh_token',
            $refreshToken,
            10080, // 7 days in minutes
            '/',
            null,
            $isSecure, // secure: true only in production (HTTP in local dev won't send secure cookies)
            true, // httpOnly
            false, // raw
            'lax' // sameSite
        );
    }

    /**
     * Refresh Token Rotation (RTR)
     */
    public function refresh(Request $request): JsonResponse
    {
        // Prioritize secure httpOnly cookie, fallback to request body for backward compatibility
        $refreshToken = $request->cookie('edudev_refresh_token') ?: $request->input('refresh_token');

        if (!$refreshToken) {
            return response()->json([
                'message' => 'Non authentifié. Jeton de rafraîchissement absent.',
            ], 401);
        }

        try {
            $payload = JWTService::decode($refreshToken);

            if (!isset($payload['type']) || $payload['type'] !== 'refresh') {
                throw new Exception('Jeton de rafraîchissement invalide.');
            }

            $hash = hash('sha256', $refreshToken);
            $tokenRecord = ApiToken::query()
                ->where('token_hash', $hash)
                ->where('expires_at', '>', now())
                ->first();

            if (!$tokenRecord) {
                throw new Exception('Jeton de rafraîchissement expiré ou révoqué.');
            }

            $user = User::query()->find($payload['sub']);

            if (!$user || !$user->is_active) {
                throw new Exception('Compte utilisateur inactif ou introuvable.');
            }

            // Invalidate the old refresh token (Strict rotation enforcement)
            $tokenRecord->delete();

            // Issue rotated tokens
            $newAccessToken = JWTService::generate([
                'sub' => $user->id,
                'role' => $user->role,
                'email' => $user->email,
            ], 900);

            $newRefreshToken = JWTService::generate([
                'sub' => $user->id,
                'type' => 'refresh',
            ], 604800);

            ApiToken::query()->create([
                'user_id' => $user->id,
                'name' => 'refresh_token',
                'token_hash' => hash('sha256', $newRefreshToken),
                'expires_at' => now()->addDays(7),
            ]);

            $isSecure = app()->environment('production', 'staging');

            return response()->json([
                'access_token' => $newAccessToken,
                'refresh_token' => $newRefreshToken,
                'user' => $this->serializeUser($user),
            ])->cookie(
                'edudev_refresh_token',
                $newRefreshToken,
                10080,
                '/',
                null,
                $isSecure, // secure: true only in production
                true,
                false,
                'lax'
            );
        } catch (Exception $e) {
            return response()->json([
                'message' => 'Non authentifié. Jeton de rafraîchissement invalide ou expiré.',
            ], 401);
        }
    }

    /**
     * Get Current Authenticated User (Stateless context)
     */
    public function me(Request $request): JsonResponse
    {
        // Authenticated user is statefully bound by AuthenticateWithJWT middleware
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'user' => null,
            ]);
        }

        return response()->json([
            'user' => $this->serializeUser($user),
        ]);
    }

    /**
     * Secure Logout (Global Session Invalidation)
     */
    public function logout(Request $request): JsonResponse
    {
        $refreshToken = $request->cookie('edudev_refresh_token') ?: $request->input('refresh_token');

        if ($refreshToken) {
            $hash = hash('sha256', $refreshToken);
            // Delete the refresh token from DB (completely revoking the session)
            ApiToken::query()->where('token_hash', $hash)->delete();
        }

        return response()->json([
            'message' => 'Déconnexion réussie.',
        ])->withoutCookie('edudev_refresh_token');
    }

    private function serializeUser(User $user): array
    {
        $user->loadMissing(['modules:id,title']);

        return [
            ...$user->toArray(),
            'role' => $this->normalizeRole($user->role),
        ];
    }

    private function normalizeRole(?string $role): string
    {
        return match ($role) {
            'administrateur' => 'admin',
            'formateur' => 'trainer',
            'stagiaire', 'student', 'learner' => 'trainee',
            default => (string) $role,
        };
    }
}
