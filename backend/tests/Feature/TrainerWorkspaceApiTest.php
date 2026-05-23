<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TrainerWorkspaceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_trainer_only_sees_their_assigned_modules(): void
    {
        $trainer = User::factory()->create(['role' => 'trainer']);
        $otherTrainer = User::factory()->create(['role' => 'trainer']);

        $assignedModule = Module::query()->create([
            'title' => 'Assigned Module',
            'slug' => 'assigned-module',
        ]);

        $hiddenModule = Module::query()->create([
            'title' => 'Hidden Module',
            'slug' => 'hidden-module',
        ]);

        $assignedModule->trainers()->sync([$trainer->id]);
        $hiddenModule->trainers()->sync([$otherTrainer->id]);

        $this->actingAs($trainer)
            ->getJson('/api/trainer/modules')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Assigned Module');
    }

    public function test_a_trainer_can_upload_a_pdf_course_inside_an_assigned_module(): void
    {
        Storage::fake('public');

        $trainer = User::factory()->create(['role' => 'trainer']);
        $module = Module::query()->create([
            'title' => 'Laravel APIs',
            'slug' => 'laravel-apis',
        ]);

        $module->trainers()->sync([$trainer->id]);

        $response = $this->actingAs($trainer)->post('/api/courses', [
            'module_id' => $module->id,
            'title' => 'Secure PDF Course',
            'description' => 'Trainer PDF upload test.',
            'level' => 'advanced',
            'duration_hours' => 10,
            'file' => UploadedFile::fake()->create('secure-course.pdf', 120, 'application/pdf'),
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('title', 'Secure PDF Course')
            ->assertJsonPath('module_id', $module->id)
            ->assertJsonPath('document.mime_type', 'application/pdf');

        $course = Course::query()->firstOrFail();

        $this->assertSame($trainer->id, $course->trainer_id);
        Storage::disk('public')->assertExists($course->document_path);
    }
}
