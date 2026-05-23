<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LessonController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Lesson::query()->with(['course:id,title', 'trainer:id,first_name,last_name']);

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->integer('course_id'));
        }

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

        if ($request->user()?->role === 'trainee') {
            $query->where('published', true)
                  ->whereIn('course_id', $request->user()->enrolledCourses()->pluck('courses.id'));
        }

        return response()->json($query->orderBy('course_id')->orderBy('position')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'trainer_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'trainer')],
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['text', 'video', 'pdf'])],
            'content' => ['nullable', 'string'],
            'video_url' => ['nullable', 'url'],
            'file_path' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:1'],
            'duration_minutes' => ['required', 'integer', 'min:1'],
            'published' => ['boolean'],
        ]);

        $this->authorizeTrainer($request, (int) $data['trainer_id']);

        $course = Course::query()->findOrFail($data['course_id']);
        if ($request->user()->role === 'trainer' && (int) $course->trainer_id !== (int) $request->user()->id) {
            abort(403, "Vous n'êtes pas autorisé à modifier les leçons de ce cours.");
        }

        $data['position'] ??= Lesson::query()
            ->where('course_id', $data['course_id'])
            ->max('position') + 1;

        $lesson = Lesson::query()->create($data);

        return response()->json($lesson->load(['course:id,title', 'trainer:id,first_name,last_name']), 201);
    }

    public function show(Request $request, Lesson $lesson): JsonResponse
    {
        $this->authorizeViewer($request, $lesson);

        return response()->json($lesson->load(['course:id,title', 'trainer:id,first_name,last_name']));
    }

    public function update(Request $request, Lesson $lesson): JsonResponse
    {
        $this->authorizeTrainer($request, $lesson->trainer_id);

        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'trainer_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'trainer')],
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['text', 'video', 'pdf'])],
            'content' => ['nullable', 'string'],
            'video_url' => ['nullable', 'url'],
            'file_path' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:1'],
            'duration_minutes' => ['required', 'integer', 'min:1'],
            'published' => ['boolean'],
        ]);

        $this->authorizeTrainer($request, (int) $data['trainer_id']);

        $course = Course::query()->findOrFail($data['course_id']);
        if ($request->user()->role === 'trainer' && (int) $course->trainer_id !== (int) $request->user()->id) {
            abort(403, "Vous n'êtes pas autorisé à modifier les leçons de ce cours.");
        }

        $lesson->update($data);

        return response()->json($lesson->load(['course:id,title', 'trainer:id,first_name,last_name']));
    }

    public function destroy(Request $request, Lesson $lesson): JsonResponse
    {
        $this->authorizeTrainer($request, $lesson->trainer_id);
        $lesson->delete();

        return response()->json(['message' => 'Lesson deleted.']);
    }

    public function complete(Request $request, Lesson $lesson): JsonResponse
    {
        abort_unless($request->user()->role === 'trainee', 403);
        abort_unless($lesson->published, 403, "Cette leçon n'est pas encore publiée.");

        $enrolled = $request->user()->enrolledCourses()->where('courses.id', $lesson->course_id)->exists();
        abort_unless($enrolled, 403);

        $request->user()->completedLessons()->syncWithoutDetaching([
            $lesson->id => ['completed' => true, 'completed_at' => now()],
        ]);

        return response()->json(['message' => 'Lesson marked as completed.']);
    }

    private function authorizeTrainer(Request $request, int $trainerId): void
    {
        if ($request->user()->role === 'trainer' && $request->user()->id !== $trainerId) {
            abort(403);
        }
    }

    private function authorizeViewer(Request $request, Lesson $lesson): void
    {
        if ($request->user()->role === 'trainer') {
            $this->authorizeTrainer($request, $lesson->trainer_id);
        }

        if ($request->user()->role === 'trainee') {
            abort_unless($lesson->published, 403, "Cette leçon n'est pas encore publiée.");
            abort_unless(
                $request->user()->enrolledCourses()->where('courses.id', $lesson->course_id)->exists(),
                403
            );
        }
    }
}
