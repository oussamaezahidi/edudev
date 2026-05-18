<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ModuleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Module::query()->with(['trainers:id,name', 'courses:id,module_id,title'])->orderBy('title')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $module = Module::query()->create([
            'title' => $data['title'],
            'slug' => Str::slug($data['title']).'-'.Str::lower(Str::random(5)),
            'description' => $data['description'] ?? null,
        ]);

        return response()->json($module->load(['trainers:id,name']), 201);
    }

    public function show(Module $module): JsonResponse
    {
        return response()->json($module->load(['trainers:id,name', 'courses.trainer:id,name']));
    }

    public function update(Request $request, Module $module): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $module->update([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
        ]);

        return response()->json($module->load(['trainers:id,name']));
    }

    public function destroy(Module $module): JsonResponse
    {
        $module->delete();

        return response()->json(['message' => 'Module deleted.']);
    }
}
