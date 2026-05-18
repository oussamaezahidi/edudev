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
            ->with(['module:id,title', 'trainer:id,name'])
            ->withCount(['practicalWorks', 'assessments', 'trainees']);

        if ($request->user()?->role === 'trainer') {
            $query->where('trainer_id', $request->user()->id);
        }

        if ($request->user()?->role === 'trainee') {
            // Trainees can see all courses; no enrollment filter needed
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

        return response()->json($this->serializeCourse($course->load(['module:id,title', 'trainer:id,name'])->loadCount([
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
                    'trainer:id,name,email,specialty',
                    'practicalWorks.course:id,title',
                    'assessments.module:id,title',
                    'assessments.course:id,title',
                    'trainees:id,name,email,specialty',
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

        if ($request->hasFile('document')) {
            $this->deleteDocument($course);
            $attributes = [...$attributes, ...$this->storeDocument($request, $trainerId)];
        }

        $course->update($attributes);

        return response()->json($this->serializeCourse($course->load(['module:id,title', 'trainer:id,name'])->loadCount([
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

    public function preview(Request $request, Course $course): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $course);
        abort_unless($course->hasDocument(), 404);

        return Storage::disk($course->document_disk)->response(
            $course->document_path,
            $course->document_name,
            [
                'Content-Type' => $course->document_mime_type ?: 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$course->document_name.'"',
            ]
        );
    }

    public function download(Request $request, Course $course): StreamedResponse
    {
        $this->authorizeTrainerOwnership($request, $course);
        abort_unless($course->hasDocument(), 404);

        return Storage::disk($course->document_disk)->download(
            $course->document_path,
            $course->document_name,
            ['Content-Type' => $course->document_mime_type ?: 'application/pdf']
        );
    }

    private function storeDocument(CourseRequest $request, int $trainerId): array
    {
        $file = $request->file('document');
        $fileName = Str::uuid()->toString().'.'.$file->extension();
        $directory = "courses/{$trainerId}";
        $path = Storage::disk('local')->putFileAs($directory, $file, $fileName);

        return [
            'document_disk' => 'local',
            'document_path' => $path,
            'document_name' => $file->getClientOriginalName(),
            'document_mime_type' => $file->getClientMimeType(),
            'document_size' => $file->getSize(),
        ];
    }

    private function deleteDocument(Course $course): void
    {
        if ($course->hasDocument()) {
            Storage::disk($course->document_disk)->delete($course->document_path);
        }
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
