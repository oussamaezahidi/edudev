<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Trainer\CourseRequest;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CourseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Course::query()
            ->with(['module:id,title', 'trainer:id,first_name,last_name'])
            ->withCount(['practicalWorks', 'assessments', 'trainees']);

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

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

            $query->whereHas('module', function ($builder) use ($yearLevel, $option) {
                $builder->where('year_level', $yearLevel)
                        ->where(function ($q) use ($option) {
                            $q->whereNull('option')
                              ->orWhere('option', $option);
                        });
            });
        }

        if ($moduleId = $request->integer('module_id')) {
            $query->where('module_id', $moduleId);
        }

        if ($search = trim((string) $request->string('q'))) {
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query
                ->orderByDesc('created_at')
                ->get()
                ->map(fn (Course $course) => $this->serializeCourse($course))
        );
    }

    public function store(CourseRequest $request): JsonResponse
    {
        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) $data['trainer_id'];
        $document = $this->storeDocument($request, $trainerId);

        $course = Course::query()->create([
            'module_id' => (int) $data['module_id'],
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'slug' => Str::slug($data['title']).'-'.Str::lower(Str::random(6)),
            'description' => $data['description'] ?? null,
            'level' => $data['level'],
            'duration_hours' => (int) $data['duration_hours'],
            ...$document,
        ]);

        return response()->json($this->serializeCourse($course->load(['module:id,title', 'trainer:id,first_name,last_name'])->loadCount([
            'practicalWorks',
            'assessments',
            'trainees',
        ])), 201);
    }

    public function show(Request $request, Course $course): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $course);

        return response()->json(
            $this->serializeCourse(
                $course->load([
                    'module:id,title,description',
                    'trainer:id,first_name,last_name,email,specialty',
                    'practicalWorks.course:id,title',
                    'assessments.module:id,title',
                    'assessments.course:id,title',
                    'trainees:id,first_name,last_name,email,specialty',
                ])->loadCount(['practicalWorks', 'assessments', 'trainees']),
                includeRelations: true
            )
        );
    }

    public function update(CourseRequest $request, Course $course): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $course);

        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) ($data['trainer_id'] ?? $course->trainer_id);

        $attributes = [
            'module_id' => (int) $data['module_id'],
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'level' => $data['level'],
            'duration_hours' => (int) $data['duration_hours'],
        ];

        if ($request->hasFile('file')) {
            $this->deleteDocument($course);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $course->update($attributes);

        return response()->json($this->serializeCourse($course->load(['module:id,title', 'trainer:id,first_name,last_name'])->loadCount([
            'practicalWorks',
            'assessments',
            'trainees',
        ])));
    }

    public function destroy(Request $request, Course $course): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $course);
        $this->deleteDocument($course);
        $course->delete();

        return response()->json(['message' => 'Course deleted.']);
    }

    public function preview(Request $request, Course $course): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $course);
        $this->authorizeStudentAccess($request, $course);
        abort_unless($course->hasDocument(), 404);

        $path = Storage::disk($course->document_disk)->path($course->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        return response()->file($path, [
            'Content-Type' => $course->document_mime_type ?: 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$course->document_name.'"',
        ]);
    }

    public function download(Request $request, Course $course): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $course);
        $this->authorizeStudentAccess($request, $course);
        abort_unless($course->hasDocument(), 404);

        $path = Storage::disk($course->document_disk)->path($course->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        if ($request->user() && $request->user()->role === 'trainee') {
            try {
                \DB::table('document_downloads')->updateOrInsert([
                    'user_id' => $request->user()->id,
                    'downloadable_type' => Course::class,
                    'downloadable_id' => $course->id,
                ], [
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                // Ignore DB logging errors
            }
        }

        return response()->download($path, $course->document_name, [
            'Content-Type' => $course->document_mime_type ?: 'application/pdf',
        ]);
    }

    private function authorizeStudentAccess(Request $request, Course $course): void
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

            $hasAccess = $course->module()
                ->where('year_level', $yearLevel)
                ->where(function ($q) use ($option) {
                    $q->whereNull('option')
                      ->orWhere('option', $option);
                })
                ->exists();

            abort_unless($hasAccess, 403, "Vous n'avez pas accès à ce cours.");
        }
    }

    private function storeDocument(CourseRequest $request, int $trainerId): array
    {
        if (! $request->hasFile('file')) {
            return [];
        }

        try {
            $file = $request->file('file');
            \Log::info('Course PDF Upload initiated', [
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

            \Log::info('Course PDF Upload completed successfully', [
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
            \Log::error('Course PDF Upload failed', [
                'trainer_id' => $trainerId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    private function deleteDocument(Course $course): void
    {
        if ($course->hasDocument()) {
            Storage::disk($course->document_disk)->delete($course->document_path);
        }
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

    private function serializeCourse(Course $course, bool $includeRelations = false): array
    {
        $payload = [
            'id' => $course->id,
            'module_id' => $course->module_id,
            'trainer_id' => $course->trainer_id,
            'title' => $course->title,
            'description' => $course->description,
            'level' => $course->level,
            'duration_hours' => $course->duration_hours,
            'module' => $course->module,
            'trainer' => $course->trainer,
            'document' => $course->hasDocument() ? [
                'name' => $course->document_name,
                'mime_type' => $course->document_mime_type,
                'size' => $course->document_size,
                'preview_url' => "/api/courses/{$course->id}/preview",
                'download_url' => "/api/courses/{$course->id}/download",
            ] : null,
            'download_stats' => $this->getDownloadStats(Course::class, $course->id, $course->module?->year_level ?? 1, $course->module?->option),
            'practical_works_count' => $course->practical_works_count ?? 0,
            'assessments_count' => $course->assessments_count ?? 0,
            'trainees_count' => $course->trainees_count ?? 0,
            'created_at' => $course->created_at,
        ];

        if ($includeRelations) {
            $payload['practical_works'] = $course->practicalWorks;
            $payload['assessments'] = $course->assessments;
            $payload['trainees'] = $course->trainees;
        }

        return $payload;
    }

    private function authorizeTrainerOwnership(Request $request, Course $course): void
    {
        if ($request->user()->role === 'trainer' && (int) $course->trainer_id !== (int) $request->user()->id) {
            abort(403);
        }

        if ($request->user()->role === 'trainee') {
            // Trainees can access any course document
        }
    }
}
