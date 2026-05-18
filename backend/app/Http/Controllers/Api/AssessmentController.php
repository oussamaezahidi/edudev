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
            'trainer:id,name',
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
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'duration_minutes' => (int) $data['duration_minutes'],
            'total_points' => (int) $data['total_points'],
            ...$document,
        ]);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title',
            'course:id,title,module_id',
            'trainer:id,name',
        ])), 201);
    }

    public function show(Request $request, Assessment $assessment): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title,description',
            'course:id,title,module_id',
            'trainer:id,name,email',
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
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'duration_minutes' => (int) $data['duration_minutes'],
            'total_points' => (int) $data['total_points'],
        ];

        if ($request->hasFile('document')) {
            $this->deleteDocument($assessment);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $assessment->update($attributes);

        return response()->json($this->serializeAssessment($assessment->load([
            'module:id,title',
            'course:id,title,module_id',
            'trainer:id,name',
        ])));
    }

    public function destroy(Request $request, Assessment $assessment): JsonResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->deleteDocument($assessment);
        $assessment->delete();

        return response()->json(['message' => 'Assessment deleted.']);
    }

    public function preview(Request $request, Assessment $assessment): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->authorizeStudentAccess($request, $assessment);
        abort_unless($assessment->hasDocument(), 404);

        return Storage::disk($assessment->document_disk)->response(
            $assessment->document_path,
            $assessment->document_name,
            [
                'Content-Type' => $assessment->document_mime_type ?: 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$assessment->document_name.'"',
            ]
        );
    }

    public function download(Request $request, Assessment $assessment): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $assessment->trainer_id);
        $this->authorizeStudentAccess($request, $assessment);
        abort_unless($assessment->hasDocument(), 404);

        return Storage::disk($assessment->document_disk)->download(
            $assessment->document_path,
            $assessment->document_name,
            ['Content-Type' => $assessment->document_mime_type ?: 'application/pdf']
        );
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
        // Trainees can access any assessment
    }

    private function storeDocument(AssessmentRequest $request, int $trainerId): array
    {
        if (! $request->hasFile('document')) {
            return [];
        }

        $file = $request->file('document');
        $directory = "assessments/{$trainerId}";
        $path = Storage::disk('local')->putFileAs($directory, $file, Str::uuid()->toString().'.'.$file->extension());

        return [
            'document_disk' => 'local',
            'document_path' => $path,
            'document_name' => $file->getClientOriginalName(),
            'document_mime_type' => $file->getClientMimeType(),
            'document_size' => $file->getSize(),
        ];
    }

    private function deleteDocument(Assessment $assessment): void
    {
        if ($assessment->hasDocument()) {
            Storage::disk($assessment->document_disk)->delete($assessment->document_path);
        }
    }
}
