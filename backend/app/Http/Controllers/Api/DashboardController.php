<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assessment;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Module;
use App\Models\PracticalWork;
use App\Models\Quiz;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(match ($user->role) {
            'admin' => $this->adminDashboard(),
            'trainer' => $this->trainerDashboard($user),
            default => $this->traineeDashboard($user),
        });
    }

    private function adminDashboard(): array
    {
        return [
            'role' => 'admin',
            'stats' => [
                'trainers' => User::query()->where('role', 'trainer')->count(),
                'users' => User::query()->count(),
                'trainees' => User::query()->where('role', 'trainee')->count(),
                'modules' => Module::query()->count(),
                'courses' => Course::query()->count(),
                'practicalWorks' => PracticalWork::query()->count(),
                'assessments' => Assessment::query()->count(),
                'inactiveUsers' => User::query()->where('is_active', false)->count(),
            ],
            'recent' => [
                'users' => User::query()->latest()->take(5)->get(),
                'trainers' => User::query()->where('role', 'trainer')->latest()->take(5)->get(),
                'modules' => Module::query()->latest()->take(5)->get(),
                'courses' => Course::query()->with(['module:id,title', 'trainer:id,name'])->latest()->take(5)->get(),
            ],
        ];
    }

    private function trainerDashboard(User $trainer): array
    {
        $trainer->load([
            'modules:id,title,description',
            'courses.module:id,title',
            'practicalWorks.course:id,title,module_id',
            'practicalWorks.course.module:id,title',
            'assessments.module:id,title',
            'assessments.course:id,title,module_id',
        ]);

        return [
            'role' => 'trainer',
            'trainer' => $trainer,
            'stats' => [
                'modules' => $trainer->modules->count(),
                'courses' => $trainer->courses->count(),
                'practicalWorks' => $trainer->practicalWorks->count(),
                'assessments' => $trainer->assessments->count(),
            ],
        ];
    }

    private function traineeDashboard(User $trainee): array
    {
        $trainee->load([
            'enrolledCourses.module:id,title',
            'enrolledCourses.trainer:id,name',
        ]);

        $courseIds = $trainee->enrolledCourses->pluck('id');
        $moduleIds = $trainee->enrolledCourses->pluck('module_id')->unique();
        $completedLessons = $trainee->completedLessons()->whereIn('course_id', $courseIds)->count();
        $totalLessons = Lesson::query()->whereIn('course_id', $courseIds)->count();

        return [
            'role' => 'trainee',
            'trainee' => $trainee,
            'stats' => [
                'trainers' => 0,
                'courses' => $trainee->enrolledCourses->count(),
                'lessons' => $totalLessons,
                'completedLessons' => $completedLessons,
                'certificates' => Certificate::query()->where('user_id', $trainee->id)->count(),
                'practicalWorks' => PracticalWork::query()->whereIn('course_id', $courseIds)->count(),
                'assessments' => Assessment::query()->whereIn('course_id', $courseIds)->count(),
            ],
            'certificates' => Certificate::query()
                ->with(['course:id,title', 'course.trainer:id,name'])
                ->where('user_id', $trainee->id)
                ->latest('issued_at')
                ->get(),
            'practicalWorks' => PracticalWork::query()
                ->with(['course:id,title', 'trainer:id,name'])
                ->whereIn('course_id', $courseIds)
                ->orderBy('due_at')
                ->get(),
            'assessments' => Assessment::query()
                ->with(['course:id,title', 'module:id,title', 'trainer:id,name'])
                ->where(function ($query) use ($courseIds, $moduleIds): void {
                    $query
                        ->whereIn('course_id', $courseIds)
                        ->orWhereIn('module_id', $moduleIds);
                })
                ->orderBy('scheduled_at')
                ->get(),
        ];
    }
}
