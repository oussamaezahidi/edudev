<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function csrfToken(Request $request): JsonResponse
    {
        return response()->json([
            'csrf_token' => $request->session()->token(),
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ], [
            'name.required' => 'Le nom est obligatoire.',
            'email.required' => 'Lâ€™adresse e-mail est obligatoire.',
            'email.email' => 'Veuillez saisir une adresse e-mail valide.',
            'email.unique' => 'Un compte existe dÃ©jÃ  avec cette adresse e-mail.',
            'password.required' => 'Le mot de passe est obligatoire.',
            'password.confirmed' => 'La confirmation du mot de passe ne correspond pas.',
        ]);

        $user = User::query()->create([
            'name' => trim($data['name']),
            'email' => strtolower(trim($data['email'])),
            'role' => 'trainee',
            'is_active' => true,
            'phone' => null,
            'specialty' => null,
            'bio' => null,
            'password' => Hash::make($data['password']),
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json($this->payloadFor($user, 'Compte crÃ©Ã© avec succÃ¨s.'), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ], [
            'email.required' => 'Lâ€™adresse e-mail est obligatoire.',
            'email.email' => 'Veuillez saisir une adresse e-mail valide.',
            'password.required' => 'Le mot de passe est obligatoire.',
        ]);

        if (! Auth::attempt([
            'email' => strtolower(trim($credentials['email'])),
            'password' => $credentials['password'],
        ], (bool) ($credentials['remember'] ?? false))) {
            throw ValidationException::withMessages([
                'email' => ['Les identifiants fournis sont incorrects.'],
            ]);
        }

        if (! $request->user()->is_active) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw ValidationException::withMessages([
                'email' => ['Votre compte a Ã©tÃ© dÃ©sactivÃ©.'],
            ]);
        }

        $request->session()->regenerate();

        return response()->json(
            $this->payloadFor($request->user(), 'Connexion rÃ©ussie.')
        );
    }

    public function me(Request $request): JsonResponse
    {
        if (! $request->user()) {
            return response()->json([
                'user' => null,
            ]);
        }

        return response()->json([
            'user' => $this->serializeUser($request->user()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        if (Auth::guard('web')->check()) {
            Auth::guard('web')->logout();
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'DÃ©connexion rÃ©ussie.']);
    }

    private function payloadFor(User $user, string $message): array
    {
        return [
            'message' => $message,
            'redirect_to' => '/dashboard',
            'user' => $this->serializeUser($user),
        ];
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
