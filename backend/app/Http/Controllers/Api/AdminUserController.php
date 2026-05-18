<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->with(['modules:id,title', 'enrolledCourses:id,title'])
            ->withCount(['courses', 'practicalWorks', 'assessments'])
            ->orderBy('name');

        if ($role = $request->string('role')->toString()) {
            $query->where('role', $role);
        }

        if ($search = trim($request->string('q')->toString())) {
            $query->where(fn ($builder) => $builder
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%"));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'role' => ['required', Rule::in(['admin', 'trainer', 'trainee'])],
            'is_active' => ['sometimes', 'boolean'],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'module_ids' => ['array'],
            'module_ids.*' => ['integer', 'exists:modules,id'],
        ]);

        $user = User::query()->create([
            'name' => $data['name'],
            'email' => strtolower(trim($data['email'])),
            'password' => Hash::make($data['password']),
            'role' => $data['role'],
            'is_active' => $data['is_active'] ?? true,
            'phone' => $data['phone'] ?? null,
            'specialty' => $data['role'] === 'trainer' ? null : ($data['specialty'] ?? null),
            'bio' => $data['role'] === 'trainer' ? null : ($data['bio'] ?? null),
        ]);

        $this->syncRelationships($user);

        return response()->json($this->loadUser($user), 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json($this->loadUser($user));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:6'],
            'role' => ['required', Rule::in(['admin', 'trainer', 'trainee'])],
            'is_active' => ['sometimes', 'boolean'],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'module_ids' => ['array'],
            'module_ids.*' => ['integer', 'exists:modules,id'],
        ]);

        $user->update([
            'name' => $data['name'],
            'email' => strtolower(trim($data['email'])),
            'role' => $data['role'],
            'is_active' => $data['is_active'] ?? $user->is_active,
            'phone' => $data['phone'] ?? null,
            'specialty' => $data['role'] === 'trainer' ? null : ($data['specialty'] ?? null),
            'bio' => $data['role'] === 'trainer' ? null : ($data['bio'] ?? null),
            ...(! empty($data['password']) ? ['password' => Hash::make($data['password'])] : []),
        ]);

        $this->syncRelationships($user);

        return response()->json($this->loadUser($user));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if((int) $request->user()->id === (int) $user->id, 422, 'Vous ne pouvez pas supprimer votre propre compte administrateur.');

        $user->delete();

        return response()->json(['message' => 'Utilisateur supprimé.']);
    }

    public function toggleStatus(Request $request, User $user): JsonResponse
    {
        abort_if((int) $request->user()->id === (int) $user->id, 422, 'Vous ne pouvez pas désactiver votre propre compte administrateur.');

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $user->update(['is_active' => $data['is_active']]);

        return response()->json($this->loadUser($user));
    }

    private function syncRelationships(User $user): void
    {
        if ($user->role !== 'trainer') {
            $user->modules()->detach();
        }
    }

    private function loadUser(User $user): User
    {
        return $user->load(['modules:id,title', 'enrolledCourses:id,title'])
            ->loadCount(['courses', 'practicalWorks', 'assessments']);
    }
}
