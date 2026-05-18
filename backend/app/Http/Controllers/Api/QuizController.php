<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use App\Models\Quiz;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class QuizController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Quiz::query()->with(['course:id,title', 'trainer:id,name', 'questions']);

        if ($request->filled('course_id')) {
            $query->where('course_id', $request->integer('course_id'));
        }

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

        return response()->json($query->orderBy('title')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'trainer_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'trainer')],
            'title' => ['required', 'string', 'max:255'],
            'pass_percentage' => ['required', 'integer', 'min:1', 'max:100'],
            'questions' => ['required', 'array', 'min:1'],
            'questions.*.prompt' => ['required', 'string'],
            'questions.*.option_a' => ['required', 'string'],
            'questions.*.option_b' => ['required', 'string'],
            'questions.*.option_c' => ['required', 'string'],
            'questions.*.option_d' => ['required', 'string'],
            'questions.*.correct_answer' => ['required', Rule::in(['a', 'b', 'c', 'd'])],
        ]);

        $this->authorizeTrainer($request, (int) $data['trainer_id']);

        $quiz = Quiz::query()->create([
            'course_id' => $data['course_id'],
            'trainer_id' => $data['trainer_id'],
            'title' => $data['title'],
            'pass_percentage' => $data['pass_percentage'],
        ]);

        $quiz->questions()->createMany($data['questions']);

        return response()->json($quiz->load(['course:id,title', 'trainer:id,name', 'questions']), 201);
    }

    public function show(Request $request, Quiz $quiz): JsonResponse
    {
        $this->authorizeQuizViewer($request, $quiz);

        return response()->json($quiz->load(['course:id,title', 'trainer:id,name', 'questions']));
    }

    public function update(Request $request, Quiz $quiz): JsonResponse
    {
        $this->authorizeTrainer($request, $quiz->trainer_id);

        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'trainer_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'trainer')],
            'title' => ['required', 'string', 'max:255'],
            'pass_percentage' => ['required', 'integer', 'min:1', 'max:100'],
            'questions' => ['required', 'array', 'min:1'],
            'questions.*.prompt' => ['required', 'string'],
            'questions.*.option_a' => ['required', 'string'],
            'questions.*.option_b' => ['required', 'string'],
            'questions.*.option_c' => ['required', 'string'],
            'questions.*.option_d' => ['required', 'string'],
            'questions.*.correct_answer' => ['required', Rule::in(['a', 'b', 'c', 'd'])],
        ]);

        $this->authorizeTrainer($request, (int) $data['trainer_id']);

        $quiz->update([
            'course_id' => $data['course_id'],
            'trainer_id' => $data['trainer_id'],
            'title' => $data['title'],
            'pass_percentage' => $data['pass_percentage'],
        ]);

        $quiz->questions()->delete();
        $quiz->questions()->createMany($data['questions']);

        return response()->json($quiz->load(['course:id,title', 'trainer:id,name', 'questions']));
    }

    public function destroy(Request $request, Quiz $quiz): JsonResponse
    {
        $this->authorizeTrainer($request, $quiz->trainer_id);
        $quiz->delete();

        return response()->json(['message' => 'Quiz deleted.']);
    }

    public function submit(Request $request, Quiz $quiz): JsonResponse
    {
        abort_unless($request->user()->role === 'trainee', 403);
        abort_unless(
            $request->user()->enrolledCourses()->where('courses.id', $quiz->course_id)->exists(),
            403
        );

        $data = $request->validate([
            'answers' => ['required', 'array'],
        ]);

        $quiz->loadMissing('questions');

        $score = 0;
        $details = [];

        foreach ($quiz->questions as $question) {
            $answer = $data['answers'][$question->id] ?? null;
            $correct = $answer === $question->correct_answer;
            if ($correct) {
                $score++;
            }

            $details[] = [
                'question_id' => $question->id,
                'answer' => $answer,
                'correct_answer' => $question->correct_answer,
                'correct' => $correct,
            ];
        }

        $total = $quiz->questions->count();
        $percentage = $total > 0 ? (int) round(($score / $total) * 100) : 0;
        $passed = $percentage >= $quiz->pass_percentage;

        $quiz->results()->updateOrCreate(
            ['user_id' => $request->user()->id],
            ['score' => $score, 'total' => $total, 'submitted_at' => now()]
        );

        if ($passed) {
            Certificate::query()->firstOrCreate(
                ['course_id' => $quiz->course_id, 'user_id' => $request->user()->id],
                ['code' => Str::upper(Str::random(12)), 'issued_at' => now()]
            );
        }

        return response()->json([
            'score' => $score,
            'total' => $total,
            'percentage' => $percentage,
            'passed' => $passed,
            'details' => $details,
        ]);
    }

    private function authorizeTrainer(Request $request, int $trainerId): void
    {
        if ($request->user()->role === 'trainer' && $request->user()->id !== $trainerId) {
            abort(403);
        }
    }

    private function authorizeQuizViewer(Request $request, Quiz $quiz): void
    {
        if ($request->user()->role === 'trainer') {
            $this->authorizeTrainer($request, $quiz->trainer_id);
        }

        if ($request->user()->role === 'trainee') {
            abort_unless(
                $request->user()->enrolledCourses()->where('courses.id', $quiz->course_id)->exists(),
                403
            );
        }
    }
}
