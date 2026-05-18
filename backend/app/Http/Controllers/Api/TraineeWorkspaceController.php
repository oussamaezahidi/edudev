<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assessment;
use App\Models\Course;
use App\Models\Module;
use App\Models\PracticalWork;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TraineeWorkspaceController extends Controller
{
    public function modules(Request $request): JsonResponse
    {
        $practicalWorkCounts = PracticalWork::query()
            ->join('courses', 'courses.id', '=', 'practical_works.course_id')
            ->selectRaw('courses.module_id, count(*) as aggregate')
            ->groupBy('courses.module_id')
            ->pluck('aggregate', 'module_id');
            
        $assessmentCounts = Assessment::query()
            ->selectRaw('module_id, count(*) as aggregate')
            ->groupBy('module_id')
            ->pluck('aggregate', 'module_id');

        return response()->json(
            Module::query()
                ->with([
                    'courses.trainer:id,name',
                    'trainers:id,name,email,specialty',
                ])
                ->withCount(['courses', 'assessments'])
                ->orderBy('title')
                ->get()
                ->map(function (Module $module) use ($practicalWorkCounts, $assessmentCounts): array {
                    return [
                        'id' => $module->id,
                        'title' => $module->title,
                        'description' => $module->description,
                        'courses' => $module->courses,
                        'trainers' => $module->trainers,
                        'courses_count' => $module->courses->count(),
                        'practical_works_count' => (int) ($practicalWorkCounts[$module->id] ?? 0),
                        'assessments_count' => (int) ($assessmentCounts[$module->id] ?? 0),
                    ];
                })
        );
    }

    public function practicalWorks(Request $request): JsonResponse
    {
        return response()->json(
            PracticalWork::query()
                ->with(['course:id,title,module_id', 'course.module:id,title', 'trainer:id,name'])
                ->orderBy('due_at')
                ->get()
                ->map(fn (PracticalWork $work) => [
                    'id' => $work->id,
                    'course_id' => $work->course_id,
                    'trainer_id' => $work->trainer_id,
                    'title' => $work->title,
                    'instructions' => $work->instructions,
                    'due_at' => $work->due_at,
                    'course' => $work->course,
                    'module' => $work->course?->module,
                    'trainer' => $work->trainer,
                    'document' => $work->hasDocument() ? [
                        'name' => $work->document_name,
                        'mime_type' => $work->document_mime_type,
                        'size' => $work->document_size,
                        'preview_url' => "/api/practical-works/{$work->id}/preview",
                        'download_url' => "/api/practical-works/{$work->id}/download",
                    ] : null,
                ])
        );
    }

    public function assessments(Request $request): JsonResponse
    {
        return response()->json(
            Assessment::query()
                ->with(['module:id,title', 'course:id,title,module_id', 'trainer:id,name'])
                ->orderBy('scheduled_at')
                ->get()
                ->map(fn (Assessment $assessment) => [
                    'id' => $assessment->id,
                    'module_id' => $assessment->module_id,
                    'course_id' => $assessment->course_id,
                    'trainer_id' => $assessment->trainer_id,
                    'title' => $assessment->title,
                    'format' => $assessment->format,
                    'scheduled_at' => $assessment->scheduled_at,
                    'duration_minutes' => $assessment->duration_minutes,
                    'total_points' => $assessment->total_points,
                    'module' => $assessment->module,
                    'course' => $assessment->course,
                    'trainer' => $assessment->trainer,
                    'document' => $assessment->hasDocument() ? [
                        'name' => $assessment->document_name,
                        'mime_type' => $assessment->document_mime_type,
                        'size' => $assessment->document_size,
                        'preview_url' => "/api/assessments/{$assessment->id}/preview",
                        'download_url' => "/api/assessments/{$assessment->id}/download",
                    ] : null,
                    'created_at' => $assessment->created_at,
                ])
        );
    }
}
