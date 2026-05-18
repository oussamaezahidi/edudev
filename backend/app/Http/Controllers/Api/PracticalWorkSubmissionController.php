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
                ->with('trainee:id,name,email,specialty')
                ->get()
                ->map(fn (PracticalWorkSubmission $submission) => $this->serializeSubmission($submission))
        );
    }

    public function store(PracticalWorkSubmissionRequest $request, PracticalWork $practicalWork): JsonResponse
    {
        $file = $request->file('submission');
        $existing = $practicalWork->submissions()->where('trainee_id', $request->user()->id)->first();

        if ($existing) {
            Storage::disk($existing->file_disk)->delete($existing->file_path);
        }

        $fileName = Str::uuid()->toString().'.'.$file->extension();
        $path = $file->storeAs("practical-submissions/{$practicalWork->id}", $fileName, 'local');

        $submission = PracticalWorkSubmission::query()->updateOrCreate(
            [
                'practical_work_id' => $practicalWork->id,
                'trainee_id' => $request->user()->id,
            ],
            [
                'file_disk' => 'local',
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

        return response()->json($this->serializeSubmission($submission->load('trainee:id,name,email,specialty')), 201);
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

        return response()->json($this->serializeSubmission($submission->load('trainee:id,name,email,specialty')));
    }

    public function preview(Request $request, PracticalWorkSubmission $submission): StreamedResponse
    {
        $this->authorizeSubmissionAccess($request, $submission);

        return Storage::disk($submission->file_disk)->response(
            $submission->file_path,
            $submission->original_name,
            [
                'Content-Type' => $submission->mime_type,
                'Content-Disposition' => 'inline; filename="'.$submission->original_name.'"',
            ]
        );
    }

    public function download(Request $request, PracticalWorkSubmission $submission): StreamedResponse
    {
        $this->authorizeSubmissionAccess($request, $submission);

        return Storage::disk($submission->file_disk)->download(
            $submission->file_path,
            $submission->original_name,
            ['Content-Type' => $submission->mime_type]
        );
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

        if ($user?->role === 'trainer' && (int) $submission->practicalWork()->value('trainer_id') === (int) $user->id) {
            return;
        }

        if ($user?->role === 'trainee' && (int) $submission->trainee_id === (int) $user->id) {
            return;
        }

        abort(403);
    }
}
