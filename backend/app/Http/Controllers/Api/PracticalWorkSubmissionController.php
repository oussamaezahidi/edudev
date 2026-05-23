<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Trainee\PracticalWorkSubmissionRequest;
use App\Http\Requests\Trainer\PracticalWorkSubmissionReviewRequest;
use App\Models\PracticalWork;
use App\Models\PracticalWorkSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PracticalWorkSubmissionController extends Controller
{
    public function index(Request $request, PracticalWork $practicalWork): JsonResponse
    {
        $this->authorizeTrainer($request, $practicalWork);

        return response()->json(
            $practicalWork->submissions()
                ->with('trainee:id,first_name,last_name,email,specialty')
                ->get()
                ->map(fn (PracticalWorkSubmission $submission) => $this->serializeSubmission($submission))
        );
    }

    public function store(PracticalWorkSubmissionRequest $request, PracticalWork $practicalWork): JsonResponse
    {
        try {
            $file = $request->file('file');
            \Log::info('Practical Work Submission PDF Upload initiated', [
                'trainee_id' => $request->user()?->id,
                'practical_work_id' => $practicalWork->id,
                'name' => $file->getClientOriginalName(),
                'size' => $file->getSize(),
                'mime' => $file->getClientMimeType()
            ]);

            $existing = $practicalWork->submissions()->where('trainee_id', $request->user()->id)->first();

            if ($existing) {
                try {
                    $existingFullPath = storage_path('app/public/' . $existing->file_path);
                    if (file_exists($existingFullPath)) {
                        unlink($existingFullPath);
                    }
                } catch (\Exception $deleteError) {
                    \Log::warning('Could not delete old submission file', ['error' => $deleteError->getMessage()]);
                }
            }

            $publicUploadsDir = storage_path('app/public/uploads');
            if (!file_exists($publicUploadsDir)) {
                mkdir($publicUploadsDir, 0755, true);
                \Log::info('Created uploads directory automatically in public disk root');
            }

            $path = $file->store('uploads', 'public');
            $fullPath = storage_path('app/public/' . $path);
            $fileExists = file_exists($fullPath);

            \Log::info('Practical Work Submission PDF Upload completed successfully', [
                'generated_path' => $path,
                'absolute_path' => $fullPath,
                'file_exists_on_disk' => $fileExists,
                'saved_file_size' => $fileExists ? filesize($fullPath) : 0
            ]);

            $submission = PracticalWorkSubmission::query()->updateOrCreate(
                [
                    'practical_work_id' => $practicalWork->id,
                    'trainee_id' => $request->user()->id,
                ],
                [
                    'file_disk' => 'public',
                    'file_path' => $path,
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getClientMimeType(),
                    'file_size' => $file->getSize(),
                    'submitted_at' => now(),
                    'score' => null,
                    'comment' => null,
                    'corrected_at' => null,
                ]
            );

            return response()->json($this->serializeSubmission($submission->load('trainee:id,first_name,last_name,email,specialty')), 201);
        } catch (\Exception $e) {
            \Log::error('Practical Work Submission PDF Upload failed', [
                'trainee_id' => $request->user()?->id,
                'practical_work_id' => $practicalWork->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    public function update(
        PracticalWorkSubmissionReviewRequest $request,
        PracticalWork $practicalWork,
        PracticalWorkSubmission $submission
    ): JsonResponse {
        $this->authorizeTrainer($request, $practicalWork);
        abort_unless((int) $submission->practical_work_id === (int) $practicalWork->id, 404);

        $submission->update([
            'score' => $request->validated()['score'] ?? null,
            'comment' => $request->validated()['comment'] ?? null,
            'corrected_at' => now(),
        ]);

        return response()->json($this->serializeSubmission($submission->load('trainee:id,first_name,last_name,email,specialty')));
    }

    public function preview(Request $request, PracticalWorkSubmission $submission): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeSubmissionAccess($request, $submission);

        $path = Storage::disk($submission->file_disk)->path($submission->file_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        return response()->file($path, [
            'Content-Type' => $submission->mime_type ?: 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$submission->original_name.'"',
        ]);
    }

    public function download(Request $request, PracticalWorkSubmission $submission): \Symfony\Component\HttpFoundation\Response
    {
        $this->authorizeSubmissionAccess($request, $submission);

        $path = Storage::disk($submission->file_disk)->path($submission->file_path);
        abort_unless(file_exists($path), 404, "Le fichier demandé n'existe pas.");

        return response()->download($path, $submission->original_name, [
            'Content-Type' => $submission->mime_type ?: 'application/pdf',
        ]);
    }

    private function serializeSubmission(PracticalWorkSubmission $submission): array
    {
        return [
            'id' => $submission->id,
            'practical_work_id' => $submission->practical_work_id,
            'trainee_id' => $submission->trainee_id,
            'original_name' => $submission->original_name,
            'mime_type' => $submission->mime_type,
            'file_size' => $submission->file_size,
            'submitted_at' => $submission->submitted_at,
            'score' => $submission->score,
            'comment' => $submission->comment,
            'corrected_at' => $submission->corrected_at,
            'trainee' => $submission->trainee,
            'preview_url' => "/api/practical-work-submissions/{$submission->id}/preview",
            'download_url' => "/api/practical-work-submissions/{$submission->id}/download",
        ];
    }

    private function authorizeTrainer(Request $request, PracticalWork $practicalWork): void
    {
        abort_unless(
            $request->user()?->role === 'trainer' && (int) $practicalWork->trainer_id === (int) $request->user()->id,
            403
        );
    }

    private function authorizeSubmissionAccess(Request $request, PracticalWorkSubmission $submission): void
    {
        $user = $request->user();

        if ($user?->role === 'admin') {
            return;
        }

        if ($user?->role === 'trainer' && (int) $submission->practicalWork()->value('trainer_id') === (int) $user->id) {
            return;
        }

        if ($user?->role === 'trainee' && (int) $submission->trainee_id === (int) $user->id) {
            return;
        }

        abort(403);
    }
}
