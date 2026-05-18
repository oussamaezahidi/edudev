<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EnsureUserRole
{
    public function handle(Request $request, Closure $next, string ...$roles): mixed
    {
        $user = $request->user();
        $role = $this->normalizeRole($user?->role);
        $allowedRoles = array_map(fn (string $allowedRole): string => $this->normalizeRole($allowedRole), $roles);

        if (! $user || ! in_array($role, $allowedRoles, true)) {
            return new JsonResponse(['message' => 'Forbidden.'], 403);
        }

        return $next($request);
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
