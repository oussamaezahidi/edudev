<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Module;
use App\Models\PracticalWork;
use App\Models\PracticalWorkSubmission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PdfStorageSystemTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_pdf_upload_storage_preview_download_and_idor_lifecycle(): void
    {
        Storage::fake('public');

        // 1. Create Roles
        $trainer = User::factory()->create(['role' => 'trainer']);
        $trainee = User::factory()->create([
            'role' => 'trainee',
            'specialty' => '1 - Full Stack' // Assign specialty corresponding to year 1
        ]);
        $unauthorizedTrainee = User::factory()->create([
            'role' => 'trainee',
            'specialty' => '2 - Mobile' // Different specialty/year
        ]);

        $module = Module::query()->create([
            'title' => 'Laravel Security',
            'slug' => 'laravel-security',
            'year_level' => 1,
            'option' => null
        ]);

        // Assign module to trainer
        $module->trainers()->sync([$trainer->id]);

        // 2. Upload Course PDF (Trainer)
        $courseResponse = $this->actingAs($trainer)->postJson('/api/courses', [
            'module_id' => $module->id,
            'title' => 'Advanced Security PDF',
            'description' => 'Secure coding guidelines.',
            'level' => 'advanced',
            'duration_hours' => 5,
            'file' => UploadedFile::fake()->create('security-guide.pdf', 500, 'application/pdf'),
        ]);

        $courseResponse->assertCreated();
        $courseId = $courseResponse->json('id');
        $course = Course::query()->findOrFail($courseId);

        $this->assertNotEmpty($course->document_path);
        $this->assertEquals('public', $course->document_disk);
        Storage::disk('public')->assertExists($course->document_path);

        // 3. Preview & Download Course PDF (Authorized Trainee)
        $previewResponse = $this->actingAs($trainee)->get("/api/courses/{$course->id}/preview");
        $previewResponse->assertOk();
        $previewResponse->assertHeader('Content-Type', 'application/pdf');

        $downloadResponse = $this->actingAs($trainee)->get("/api/courses/{$course->id}/download");
        $downloadResponse->assertOk();
        $downloadResponse->assertHeader('Content-Disposition', 'attachment; filename=security-guide.pdf');

        // 4. IDOR Block (Unauthorized Trainee with mismatched specialty should be blocked)
        $unauthorizedPreview = $this->actingAs($unauthorizedTrainee)->get("/api/courses/{$course->id}/preview");
        $unauthorizedPreview->assertStatus(403);

        // Enroll trainee in the course so they are authorized to submit TPs
        $trainee->enrolledCourses()->sync([$course->id]);

        // 5. Practical Work Submission (Trainee uploads TP)
        $practicalWork = PracticalWork::query()->create([
            'course_id' => $course->id,
            'trainer_id' => $trainer->id,
            'title' => 'Laravel Hardening Lab',
            'instructions' => 'Follow security guidelines PDF.',
            'document_disk' => 'public',
            'document_path' => $course->document_path,
            'document_name' => 'security-guide.pdf',
            'document_mime_type' => 'application/pdf',
            'document_size' => 500
        ]);

        // Trainee submits solution
        $submissionResponse = $this->actingAs($trainee)->postJson("/api/practical-works/{$practicalWork->id}/submissions", [
            'file' => UploadedFile::fake()->create('trainee-lab-solution.pdf', 300, 'application/pdf'),
        ]);

        $submissionResponse->assertCreated();
        $submissionId = $submissionResponse->json('id');
        $submission = PracticalWorkSubmission::query()->findOrFail($submissionId);

        $this->assertEquals('public', $submission->file_disk);
        Storage::disk('public')->assertExists($submission->file_path);

        // 6. Preview Trainee Submission (Trainer & Trainee Authorized, Other Trainee Blocked)
        $trainerPreview = $this->actingAs($trainer)->get("/api/practical-work-submissions/{$submission->id}/preview");
        $trainerPreview->assertOk();

        $ownTraineePreview = $this->actingAs($trainee)->get("/api/practical-work-submissions/{$submission->id}/preview");
        $ownTraineePreview->assertOk();

        // Mismatched trainee trying to view other's TP solution should get 403 Forbidden
        $otherTraineePreview = $this->actingAs($unauthorizedTrainee)->get("/api/practical-work-submissions/{$submission->id}/preview");
        $otherTraineePreview->assertStatus(403);
    }
}
