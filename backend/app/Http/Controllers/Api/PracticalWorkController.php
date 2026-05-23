<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Trainer\PracticalWorkRequest;
use App\Models\PracticalWork;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PracticalWorkController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = PracticalWork::query()
            ->with(['course:id,title,module_id', 'course.module:id,title', 'trainer:id,first_name,last_name']);

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

        if ($courseId = $request->integer('course_id')) {
            $query->where('course_id', $courseId);
        }

        if ($moduleId = $request->integer('module_id')) {
            $query->whereHas('course', fn ($builder) => $builder->where('module_id', $moduleId));
        }

        if ($search = trim((string) $request->string('q'))) {
            $query->where(fn ($builder) => $builder
                ->where('title', 'like', "%{$search}%")
                ->orWhere('instructions', 'like', "%{$search}%"));
        }

        return response()->json(
            $query->orderBy('due_at')->get()->map(fn (PracticalWork $practicalWork) => $this->serializePracticalWork($practicalWork))
        );
    }

    public function store(PracticalWorkRequest $request): JsonResponse
    {
        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) $data['trainer_id'];

        $document = $this->storeDocument($request, $trainerId);

        $practicalWork = PracticalWork::query()->create([
            'course_id' => (int) $data['course_id'],
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'instructions' => $data['instructions'],
            'due_at' => $data['due_at'] ?? null,
            ...$document,
        ]);

        return response()->json($this->serializePracticalWork($practicalWork->load([
            'course:id,title,module_id',
            'course.module:id,title',
            'trainer:id,first_name,last_name',
        ])), 201);
    }

    public function show(Request $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->authorizeStudentAccess($request, $practicalWork);

        return response()->json(
            $this->serializePracticalWork(
                $practicalWork->load([
                    'course:id,title,module_id',
                    'course.module:id,title',
                    'trainer:id,first_name,last_name,email',
                ]),
                includeRelations: true
            )
        );
    }

    public function update(PracticalWorkRequest $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);

        $data = $request->validated();
        $trainerId = $request->user()->role === 'trainer' ? $request->user()->id : (int) ($data['trainer_id'] ?? $practicalWork->trainer_id);

        $attributes = [
            'course_id' => (int) $data['course_id'],
            'trainer_id' => $trainerId,
            'title' => $data['title'],
            'instructions' => $data['instructions'],
            'due_at' => $data['due_at'] ?? null,
        ];

        if ($request->hasFile('file')) {
            $this->deleteDocument($practicalWork);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $practicalWork->update($attributes);

        return response()->json($this->serializePracticalWork($practicalWork->load([
            'course:id,title,module_id',
            'course.module:id,title',
            'trainer:id,first_name,last_name',
        ])));
    }

    public function destroy(Request $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->deleteDocument($practicalWork);
        $practicalWork->delete();

        return response()->json(['message' => 'Practical work deleted.']);
    }

    public function preview(Request $request, PracticalWork $practicalWork): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->authorizeStudentAccess($request, $practicalWork);
        abort_unless($practicalWork->hasDocument(), 404);

        $path = Storage::disk($practicalWork->document_disk)->path($practicalWork->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        return response()->file($path, [
            'Content-Type' => $practicalWork->document_mime_type ?: 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$practicalWork->document_name.'"',
        ]);
    }

    public function download(Request $request, PracticalWork $practicalWork): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->authorizeStudentAccess($request, $practicalWork);
        abort_unless($practicalWork->hasDocument(), 404);

        $path = Storage::disk($practicalWork->document_disk)->path($practicalWork->document_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        if ($request->user() && $request->user()->role === 'trainee') {
            try {
                \DB::table('document_downloads')->updateOrInsert([
                    'user_id' => $request->user()->id,
                    'downloadable_type' => PracticalWork::class,
                    'downloadable_id' => $practicalWork->id,
                ], [
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                // Ignore DB logging errors
            }
        }

        return response()->download($path, $practicalWork->document_name, [
            'Content-Type' => $practicalWork->document_mime_type ?: 'application/pdf',
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

        return [
            'count' => $downloadedCount,
            'percentage' => min(100, $percentage),
        ];
    }

    private function serializePracticalWork(PracticalWork $practicalWork, bool $includeRelations = false): array
    {
        $payload = [
            'id' => $practicalWork->id,
            'course_id' => $practicalWork->course_id,
            'trainer_id' => $practicalWork->trainer_id,
            'title' => $practicalWork->title,
            'instructions' => $practicalWork->instructions,
            'due_at' => $practicalWork->due_at,
            'course' => $practicalWork->course,
            'module' => $practicalWork->course?->module,
            'trainer' => $practicalWork->trainer,
            'document' => $practicalWork->hasDocument() ? [
                'name' => $practicalWork->document_name,
                'mime_type' => $practicalWork->document_mime_type,
                'size' => $practicalWork->document_size,
                'preview_url' => "/api/practical-works/{$practicalWork->id}/preview",
                'download_url' => "/api/practical-works/{$practicalWork->id}/download",
            ] : null,
            'download_stats' => $this->getDownloadStats(PracticalWork::class, $practicalWork->id, $practicalWork->course?->module?->year_level ?? 1, $practicalWork->course?->module?->option),
            'created_at' => $practicalWork->created_at,
        ];

        return $payload;
    }

    private function authorizeTrainerOwnership(Request $request, int $trainerId): void
    {
        if ($request->user()->role === 'trainer' && $request->user()->id !== $trainerId) {
            abort(403);
        }
    }

    private function authorizeStudentAccess(Request $request, PracticalWork $practicalWork): void
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

            $hasAccess = $practicalWork->course()
                ->whereHas('module', function ($builder) use ($yearLevel, $option) {
                    $builder->where('year_level', $yearLevel)
                            ->where(function ($q) use ($option) {
                                $q->whereNull('option')
                                  ->orWhere('option', $option);
                            });
                })
                ->exists();

            abort_unless($hasAccess, 403, "Vous n'avez pas accès à ce TP.");
        }
    }

    private function storeDocument(PracticalWorkRequest $request, int $trainerId): array
    {
        if (! $request->hasFile('file')) {
            return [];
        }

        try {
            $file = $request->file('file');
            \Log::info('Practical Work PDF Upload initiated', [
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

            \Log::info('Practical Work PDF Upload completed successfully', [
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
            \Log::error('Practical Work PDF Upload failed', [
                'trainer_id' => $trainerId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    private function deleteDocument(PracticalWork $practicalWork): void
    {
        if ($practicalWork->hasDocument()) {
            Storage::disk($practicalWork->document_disk)->delete($practicalWork->document_path);
        }
    }
}
