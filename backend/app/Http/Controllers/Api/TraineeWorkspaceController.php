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
    private function getDownloadStats(string $type, int $id, int $yearLevel, ?string $option = null): array
    {
        static $traineeCountCache = [];
        static $downloadCountsCache = null;

        $cacheKey = "{$yearLevel}-" . ($option ?: 'null');

        if (!isset($traineeCountCache[$cacheKey])) {
            $traineeQuery = \App\Models\User::query()
                ->where('role', 'trainee')
                ->where('specialty', $yearLevel === 2 ? 'like' : 'like', $yearLevel === 2 ? '%2%' : '%1%');

            if ($yearLevel === 2 && $option) {
                $traineeQuery->where('specialty', 'like', "%{$option}%");
            }

            $traineeCountCache[$cacheKey] = $traineeQuery->count();
        }

        $totalTrainees = $traineeCountCache[$cacheKey];

        if ($downloadCountsCache === null) {
            $downloadCountsCache = \DB::table('document_downloads')
                ->where('downloadable_type', $type)
                ->selectRaw('downloadable_id, count(*) as count')
                ->groupBy('downloadable_id')
                ->pluck('count', 'downloadable_id')
                ->toArray();
        }

        $downloadedCount = $downloadCountsCache[$id] ?? 0;
        $percentage = $totalTrainees > 0 ? (int) round(($downloadedCount / $totalTrainees) * 100) : 0;

        return [
            'count' => $downloadedCount,
            'percentage' => min(100, $percentage),
        ];
    }

    public function modules(Request $request): JsonResponse
    {
        $specialty = (string) $request->user()->specialty;
        $yearLevel = str_contains($specialty, '2') ? 2 : 1;

        $option = null;
        if ($yearLevel === 2) {
            if (str_contains($specialty, 'Full Stack')) {
                $option = 'Full Stack';
            } elseif (str_contains($specialty, 'Mobile')) {
                $option = 'Mobile';
            } elseif (str_contains($specialty, 'RV/RA')) {
                $option = 'RV/RA';
            }
        }

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
                ->where('year_level', $yearLevel)
                ->where(function ($q) use ($option) {
                    $q->whereNull('option')
                      ->orWhere('option', $option);
                })
                ->with([
                    'courses.trainer:id,first_name,last_name',
                    'trainers:id,first_name,last_name,email,specialty',
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
        $specialty = (string) $request->user()->specialty;
        $yearLevel = str_contains($specialty, '2') ? 2 : 1;

        $option = null;
        if ($yearLevel === 2) {
            if (str_contains($specialty, 'Full Stack')) {
                $option = 'Full Stack';
            } elseif (str_contains($specialty, 'Mobile')) {
                $option = 'Mobile';
            } elseif (str_contains($specialty, 'RV/RA')) {
                $option = 'RV/RA';
            }
        }

        return response()->json(
            PracticalWork::query()
                ->whereHas('course.module', function ($builder) use ($yearLevel, $option) {
                    $builder->where('year_level', $yearLevel)
                            ->where(function ($q) use ($option) {
                                $q->whereNull('option')
                                  ->orWhere('option', $option);
                            });
                })
                ->with(['course:id,title,module_id', 'course.module:id,title', 'trainer:id,first_name,last_name'])
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
                    'download_stats' => $this->getDownloadStats(PracticalWork::class, $work->id, $work->course?->module?->year_level ?? 1, $work->course?->module?->option),
                ])
        );
    }

    public function assessments(Request $request): JsonResponse
    {
        $specialty = (string) $request->user()->specialty;
        $yearLevel = str_contains($specialty, '2') ? 2 : 1;

        $option = null;
        if ($yearLevel === 2) {
            if (str_contains($specialty, 'Full Stack')) {
                $option = 'Full Stack';
            } elseif (str_contains($specialty, 'Mobile')) {
                $option = 'Mobile';
            } elseif (str_contains($specialty, 'RV/RA')) {
                $option = 'RV/RA';
            }
        }

        return response()->json(
            Assessment::query()
                ->whereHas('module', function ($builder) use ($yearLevel, $option) {
                    $builder->where('year_level', $yearLevel)
                            ->where(function ($q) use ($option) {
                                $q->whereNull('option')
                                  ->orWhere('option', $option);
                            });
                })
                ->with(['module:id,title', 'course:id,title,module_id', 'trainer:id,first_name,last_name'])
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
                    'download_stats' => $this->getDownloadStats(Assessment::class, $assessment->id, $assessment->module?->year_level ?? 1, $assessment->module?->option),
                    'created_at' => $assessment->created_at,
                ])
        );
    }
}
