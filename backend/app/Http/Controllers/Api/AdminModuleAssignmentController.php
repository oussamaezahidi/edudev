<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\TrainerModuleAssignment;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminModuleAssignmentController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'history' => TrainerModuleAssignment::query()
                ->with(['trainer:id,name,email', 'module:id,title', 'admin:id,name'])
                ->latest('assigned_at')
                ->limit(200)
                ->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'trainer_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'trainer')],
            'module_ids' => ['required', 'array', 'min:1'],
            'module_ids.*' => ['integer', 'exists:modules,id'],
        ]);

        $trainer = User::query()->where('role', 'trainer')->findOrFail($data['trainer_id']);
        $moduleIds = collect($data['module_ids'])->map(fn ($id) => (int) $id)->unique()->values();
        $currentIds = $trainer->modules()->pluck('modules.id');
        $newIds = $moduleIds->diff($currentIds)->values();

        if ($newIds->isNotEmpty()) {
            $trainer->modules()->syncWithoutDetaching($newIds->all());

            foreach ($newIds as $moduleId) {
                TrainerModuleAssignment::query()->create([
                    'trainer_id' => $trainer->id,
                    'module_id' => $moduleId,
                    'assigned_by' => $request->user()->id,
                    'action' => 'assigned',
                    'assigned_at' => now(),
                ]);
            }
        }

        return response()->json([
            'message' => 'Modules affectés.',
            'trainer' => $trainer->fresh()->load(['modules:id,title']),
            'assigned_module_ids' => $newIds->all(),
            'history' => $this->history(),
        ]);
    }

    public function destroy(Request $request, User $trainer, Module $module): JsonResponse
    {
        abort_unless($trainer->role === 'trainer', 404);

        $trainer->modules()->detach($module->id);

        TrainerModuleAssignment::query()->create([
            'trainer_id' => $trainer->id,
            'module_id' => $module->id,
            'assigned_by' => $request->user()->id,
            'action' => 'removed',
            'assigned_at' => now(),
        ]);

        return response()->json([
            'message' => 'Affectation retirée.',
            'trainer' => $trainer->fresh()->load(['modules:id,title']),
            'history' => $this->history(),
        ]);
    }

    private function history()
    {
        return TrainerModuleAssignment::query()
            ->with(['trainer:id,name,email', 'module:id,title', 'admin:id,name'])
            ->latest('assigned_at')
            ->limit(200)
            ->get();
    }
}
