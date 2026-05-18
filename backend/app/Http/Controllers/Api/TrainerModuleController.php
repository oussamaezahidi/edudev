<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrainerModuleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $trainer = $request->user();
        $modules = $trainer->modules()
            ->with([
                'courses' => fn ($query) => $query
                    ->where('trainer_id', $trainer->id)
                    ->withCount(['practicalWorks', 'assessments'])
                    ->with('trainer:id,name'),
            ])
            ->orderBy('title')
            ->get();

        return response()->json($modules->map(fn (Module $module) => $this->serializeModule($module)));
    }

    public function show(Request $request, Module $module): JsonResponse
    {
        abort_unless($request->user()->modules()->whereKey($module->id)->exists(), 403);

        $module->load([
            'courses' => fn ($query) => $query
                ->where('trainer_id', $request->user()->id)
                ->withCount(['practicalWorks', 'assessments'])
                ->with([
                    'practicalWorks:id,course_id,title,due_at',
                    'assessments:id,module_id,course_id,title,scheduled_at',
                ]),
        ]);

        return response()->json($this->serializeModule($module, true));
    }

    private function serializeModule(Module $module, bool $includeRelations = false): array
    {
        $courses = $module->courses ?? collect();

        $payload = [
            'id' => $module->id,
            'title' => $module->title,
            'description' => $module->description,
            'courses_count' => $courses->count(),
            'practical_works_count' => $courses->sum('practical_works_count'),
            'assessments_count' => $courses->sum('assessments_count'),
        ];

        if ($includeRelations || $courses->isNotEmpty()) {
            $payload['courses'] = $courses;
        }

        return $payload;
    }
}
