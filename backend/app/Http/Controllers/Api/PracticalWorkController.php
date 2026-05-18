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
            ->with(['course:id,title,module_id', 'course.module:id,title', 'trainer:id,name']);

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
            'trainer:id,name',
        ])), 201);
    }

    public function show(Request $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);

        return response()->json(
            $this->serializePracticalWork(
                $practicalWork->load([
                    'course:id,title,module_id',
                    'course.module:id,title',
                    'trainer:id,name,email',
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

        if ($request->hasFile('document')) {
            $this->deleteDocument($practicalWork);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $practicalWork->update($attributes);

        return response()->json($this->serializePracticalWork($practicalWork->load([
            'course:id,title,module_id',
            'course.module:id,title',
            'trainer:id,name',
        ])));
    }

    public function destroy(Request $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->deleteDocument($practicalWork);
        $practicalWork->delete();

        return response()->json(['message' => 'Practical work deleted.']);
    }

    public function preview(Request $request, PracticalWork $practicalWork): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->authorizeStudentAccess($request, $practicalWork);
        abort_unless($practicalWork->hasDocument(), 404);

        return Storage::disk($practicalWork->document_disk)->response(
            $practicalWork->document_path,
            $practicalWork->document_name,
            [
                'Content-Type' => $practicalWork->document_mime_type ?: 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$practicalWork->document_name.'"',
            ]
        );
    }

    public function download(Request $request, PracticalWork $practicalWork): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $practicalWork->trainer_id);
        $this->authorizeStudentAccess($request, $practicalWork);
        abort_unless($practicalWork->hasDocument(), 404);

        return Storage::disk($practicalWork->document_disk)->download(
            $practicalWork->document_path,
            $practicalWork->document_name,
            ['Content-Type' => $practicalWork->document_mime_type ?: 'application/pdf']
        );
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
        // Trainees can access any practical work
    }

    private function storeDocument(PracticalWorkRequest $request, int $trainerId): array
    {
        if (! $request->hasFile('document')) {
            return [];
        }

        $file = $request->file('document');
        $directory = "practical-works/{$trainerId}";
        $path = Storage::disk('local')->putFileAs($directory, $file, Str::uuid()->toString().'.'.$file->extension());

        return [
            'document_disk' => 'local',
            'document_path' => $path,
            'document_name' => $file->getClientOriginalName(),
            'document_mime_type' => $file->getClientMimeType(),
            'document_size' => $file->getSize(),
        ];
    }

    private function deleteDocument(PracticalWork $practicalWork): void
    {
        if ($practicalWork->hasDocument()) {
            Storage::disk($practicalWork->document_disk)->delete($practicalWork->document_path);
        }
    }
}
