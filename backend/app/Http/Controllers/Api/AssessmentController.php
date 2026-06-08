<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Trainer\AssessmentRequest;
use App\Models\Assessment;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssessmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Assessment::query()->with([
            'module:id,title',
            'course:id,title,module_id',
            'trainer:id,first_name,last_name',
        ]);

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

        if ($moduleId = $request->integer('module_id')) {
            $query->where('module_id', $moduleId);
        }

        if ($search = trim((string) $request->string('q'))) {
            $query->where('title', 'like', "%{$search}%");
        }

        return response()->json($query->orderBy('scheduled_at')->get()->map(
            fn (Assessment $assessment) => $this->serializeAssessment($assessment)
        ));
    }

    public function store(AssessmentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) $data['trainer_id'];
        $course = ! empty($data['course_id']) ? Course::query()->find($data['course_id']) : null;
        $moduleId = (int) ($data['module_id'] ?? $course?->module_id);
        $document = $this->storeDocument($request, $trainerId);

        $assessment = Assessment::query()->create([
            'module_id' => $moduleId,
            'course_id' => $course?->id,
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'format' => $data['format'],
            'scheduled_at' => !empty($data['scheduled_at']) ? $data['scheduled_at'] : null,
            'duration_minutes' => (int) $data['duration_minutes'],
            'total_points' => (int) $data['total_points'],
            ...$document,
        ]);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title',
            'course:id,title,module_id',
            'trainer:id,first_name,last_name',
        ])), 201);
    }

    public function show(Request $request, Assessment $assessment): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->authorizeStudentAccess($request, $assessment);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title,description',
            'course:id,title,module_id',
            'trainer:id,first_name,last_name,email',
        ])));
    }

    public function update(AssessmentRequest $request, Assessment $assessment): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);

        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) ($data['trainer_id'] ?? $assessment->trainer_id);
        $course = ! empty($data['course_id']) ? Course::query()->find($data['course_id']) : null;

        $attributes = [
            'module_id' => (int) ($data['module_id'] ?? $course?->module_id ?? $assessment->module_id),
            'course_id' => $course?->id,
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'format' => $data['format'],
            'scheduled_at' => !empty($data['scheduled_at']) ? $data['scheduled_at'] : null,
            'duration_minutes' => (int) $data['duration_minutes'],
            'total_points' => (int) $data['total_points'],
        ];

        if ($request->hasFile('file')) {
            $this->deleteDocument($assessment);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $assessment->update($attributes);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title',
            'course:id,title,module_id',
            'trainer:id,first_name,last_name',
        ])));
    }

    public function destroy(Request $request, Assessment $assessment): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->deleteDocument($assessment);
        $assessment->delete();

        return response()->json(['message' => 'Assessment deleted.']);
    }

    public function preview(Request $request, Assessment $assessment): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->authorizeStudentAccess($request, $assessment);
        abort_unless($assessment->hasDocument(), 404);

        $path = Storage::disk($assessment->document_disk)->path($assessment->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        if ($request->user() && in_array($request->user()->role, ['trainee', 'stagiaire', 'student', 'learner'])) {
            try {
                \DB::table('document_downloads')->updateOrInsert([
                    'user_id' => $request->user()->id,
                    'downloadable_type' => Assessment::class,
                    'downloadable_id' => $assessment->id,
                ], [
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                // Ignore DB logging errors
            }
        }

        return response()->file($path, [
            'Content-Type' => $assessment->document_mime_type ?: 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$assessment->document_name.'"',
        ]);
    }

    public function download(Request $request, Assessment $assessment): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->authorizeStudentAccess($request, $assessment);
        abort_unless($assessment->hasDocument(), 404);

        $path = Storage::disk($assessment->document_disk)->path($assessment->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        if ($request->user() && in_array($request->user()->role, ['trainee', 'stagiaire', 'student', 'learner'])) {
            try {
                \DB::table('document_downloads')->updateOrInsert([
                    'user_id' => $request->user()->id,
                    'downloadable_type' => Assessment::class,
                    'downloadable_id' => $assessment->id,
                ], [
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                // Ignore DB logging errors
            }
        }

        return response()->download($path, $assessment->document_name, [
            'Content-Type' => $assessment->document_mime_type ?: 'application/pdf',
        ]);
    }

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

        $lastDownload = \DB::table('document_downloads')
            ->where('downloadable_type', $type)
            ->where('downloadable_id', $id)
            ->latest('created_at')
            ->value('created_at');

        return [
            'count' => $downloadedCount,
            'percentage' => min(100, $percentage),
            'last_download_at' => $lastDownload,
            'lastDownloadAt' => $lastDownload,
        ];
    }

    private function serializeAssessment(Assessment $assessment): array
    {
        return [
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
        ];
    }

    private function authorizeTrainerOwnership(Request $request, int $trainerId): void
    {
        if ($request->user()->role === 'trainer' && $request->user()->id !== $trainerId) {
            abort(403);
        }
    }

    private function authorizeStudentAccess(Request $request, Assessment $assessment): void
    {
        if ($request->user()?->role === 'trainee') {
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

            $hasAccess = $assessment->module()
                ->where('year_level', $yearLevel)
                ->where(function ($q) use ($option) {
                    $q->whereNull('option')
                      ->orWhere('option', $option);
                })
                ->exists();

            abort_unless($hasAccess, 403, "Vous n'avez pas accès à ce contrôle.");
        }
    }

    private function storeDocument(AssessmentRequest $request, int $trainerId): array
    {
        if (! $request->hasFile('file')) {
            return [];
        }

        try {
            $file = $request->file('file');
            \Log::info('Assessment PDF Upload initiated', [
                'trainer_id' => $trainerId,
                'name' => $file->getClientOriginalName(),
                'size' => $file->getSize(),
                'mime' => $file->getClientMimeType()
            ]);

            $publicUploadsDir = storage_path('app/public/uploads');
            if (!file_exists($publicUploadsDir)) {
                mkdir($publicUploadsDir, 0755, true);
                \Log::info('Created uploads directory automatically in public disk root');
            }

            $path = $file->store('uploads', 'public');
            $fullPath = storage_path('app/public/' . $path);
            $fileExists = file_exists($fullPath);

            \Log::info('Assessment PDF Upload completed successfully', [
                'generated_path' => $path,
                'absolute_path' => $fullPath,
                'file_exists_on_disk' => $fileExists,
                'saved_file_size' => $fileExists ? filesize($fullPath) : 0
            ]);

            return [
                'document_disk' => 'public',
                'document_path' => $path,
                'document_name' => $file->getClientOriginalName(),
                'document_mime_type' => $file->getClientMimeType(),
                'document_size' => $file->getSize(),
            ];
        } catch (\Exception $e) {
            \Log::error('Assessment PDF Upload failed', [
                'trainer_id' => $trainerId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    private function deleteDocument(Assessment $assessment): void
    {
        if ($assessment->hasDocument()) {
            Storage::disk($assessment->document_disk)->delete($assessment->document_path);
        }
    }
}
