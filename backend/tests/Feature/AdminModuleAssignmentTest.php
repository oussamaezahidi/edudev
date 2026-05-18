<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\TrainerModuleAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminModuleAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_assigns_modules_without_replacing_existing_assignments(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $trainer = User::factory()->create(['role' => 'trainer']);

        $firstModule = Module::query()->create(['title' => 'Laravel', 'slug' => 'laravel']);
        $secondModule = Module::query()->create(['title' => 'React', 'slug' => 'react']);

        $trainer->modules()->attach($firstModule->id);

        $this->actingAs($admin)
            ->postJson('/api/admin/module-assignments', [
                'trainer_id' => $trainer->id,
                'module_ids' => [$secondModule->id],
            ])
            ->assertOk()
            ->assertJsonPath('trainer.modules.0.id', $firstModule->id)
            ->assertJsonPath('trainer.modules.1.id', $secondModule->id);

        $this->assertDatabaseHas('trainer_module', [
            'trainer_id' => $trainer->id,
            'module_id' => $firstModule->id,
        ]);

        $this->assertDatabaseHas('trainer_module', [
            'trainer_id' => $trainer->id,
            'module_id' => $secondModule->id,
        ]);

        $this->assertSame(1, TrainerModuleAssignment::query()->where('action', 'assigned')->count());
    }

    public function test_admin_can_remove_assignment_and_keep_history(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $trainer = User::factory()->create(['role' => 'trainer']);
        $module = Module::query()->create(['title' => 'MySQL', 'slug' => 'mysql']);

        $trainer->modules()->attach($module->id);

        $this->actingAs($admin)
            ->deleteJson("/api/admin/module-assignments/{$trainer->id}/{$module->id}")
            ->assertOk()
            ->assertJsonPath('trainer.modules', []);

        $this->assertDatabaseMissing('trainer_module', [
            'trainer_id' => $trainer->id,
            'module_id' => $module->id,
        ]);

        $this->assertDatabaseHas('trainer_module_assignments', [
            'trainer_id' => $trainer->id,
            'module_id' => $module->id,
            'action' => 'removed',
        ]);
    }
}
