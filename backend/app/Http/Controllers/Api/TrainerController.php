<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class TrainerController extends Controller
{
    public function index(): JsonResponse
    {
        $trainers = User::query()
            ->where('role', 'trainer')
            ->with(['modules:id,title'])
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        return response()->json($trainers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['nullable', 'string', 'min:6'],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'module_ids' => ['array'],
            'module_ids.*' => ['integer', 'exists:modules,id'],
        ]);

        $nameParts = explode(' ', trim($data['name']), 2);
        $firstName = $nameParts[0] ?? '';
        $lastName = $nameParts[1] ?? '';

        $trainer = User::query()->create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $data['email'],
            'password' => Hash::make($data['password'] ?? 'password'),
            'role' => 'trainer',
            'phone' => $data['phone'] ?? null,
            'specialty' => null,
            'bio' => null,
        ]);

        if (! empty($data['module_ids'])) {
            $trainer->modules()->syncWithoutDetaching($data['module_ids']);
        }

        return response()->json($trainer->load(['modules:id,title']), 201);
    }

    public function show(User $trainer): JsonResponse
    {
        abort_unless($trainer->role === 'trainer', 404);

        return response()->json($trainer->load([
            'modules:id,title',
            'courses.module:id,title',
            'practicalWorks.course:id,title',
            'assessments.course:id,title',
        ]));
    }

    public function update(Request $request, User $trainer): JsonResponse
    {
        abort_unless($trainer->role === 'trainer', 404);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($trainer->id)],
            'password' => ['nullable', 'string', 'min:6'],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'module_ids' => ['array'],
            'module_ids.*' => ['integer', 'exists:modules,id'],
        ]);

        $nameParts = explode(' ', trim($data['name']), 2);
        $firstName = $nameParts[0] ?? '';
        $lastName = $nameParts[1] ?? '';

        $trainer->update([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'specialty' => null,
            'bio' => null,
            ...(! empty($data['password']) ? ['password' => Hash::make($data['password'])] : []),
        ]);

        if (! empty($data['module_ids'])) {
            $trainer->modules()->syncWithoutDetaching($data['module_ids']);
        }

        return response()->json($trainer->load(['modules:id,title']));
    }

    public function destroy(User $trainer): JsonResponse
    {
        abort_unless($trainer->role === 'trainer', 404);
        $trainer->delete();

        return response()->json(['message' => 'Formateur supprimé.']);
    }
}
