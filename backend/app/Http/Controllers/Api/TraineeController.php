<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TraineeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            User::query()
                ->where('role', 'trainee')
                ->with(['enrolledCourses:id,title'])
                ->orderBy('name')
                ->get()
        );
    }

    public function update(Request $request, User $trainee): JsonResponse
    {
        abort_unless($trainee->role === 'trainee', 404);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($trainee->id)],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string'],
            'course_ids' => ['array'],
            'course_ids.*' => ['integer', 'exists:courses,id'],
        ]);

        $trainee->update([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'specialty' => $data['specialty'] ?? null,
            'bio' => $data['bio'] ?? null,
        ]);

        $trainee->enrolledCourses()->sync(
            collect($data['course_ids'] ?? [])->mapWithKeys(fn (int $courseId) => [
                $courseId => ['status' => 'in_progress'],
            ])->all()
        );

        return response()->json($trainee->load(['enrolledCourses:id,title']));
    }
}
