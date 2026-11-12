"""Deterministic offline asset conversion. Configuration supplies geometry, joints and maps.
Run only through prepare-model-assets.mjs; no downloads or page implementation here.
"""
import bpy, json, sys, os, math, collections
from mathutils import Vector

config_path = sys.argv[sys.argv.index('--') + 1]
with open(config_path, encoding='utf-8') as stream:
    cfg = json.load(stream)
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
def local(p): return os.path.join(root, p)
def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m
def save_glb(objects, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False); obj.hide_viewport = False; obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=local(filename), export_format='GLB', use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False, export_extras=True,
        export_image_format='AUTO')

bpy.ops.wm.open_mainfile(filepath=local(cfg['hand']['input']))
hand = bpy.data.objects[cfg['hand']['object']]
hand.animation_data_clear()
hand.location=(0,0,0); hand.rotation_euler=(0,0,0); hand.scale=(1,1,1)
hand.hide_set(False); hand.hide_viewport=False
skin = material('CC0 hand / skin', cfg['hand']['skinColor'], .64)
nail = material('CC0 hand / natural nails', cfg['hand']['nailColor'], .38)
hand.data.materials.clear(); hand.data.materials.append(skin); hand.data.materials.append(nail)
faces = [item.value for item in hand.data.attributes['.sculpt_face_set'].data]
members = collections.defaultdict(list)
for polygon in hand.data.polygons:
    face = faces[polygon.index]
    polygon.material_index = 1 if face in cfg['hand']['nailFaceSets'] else 0
    for index in polygon.vertices: members[index].append(face)

# The rig is derived from the supplied finger segments, not from a generic runtime hand.
armature = bpy.data.armatures.new('Campo anatomical hand rig')
rig = bpy.data.objects.new('Campo hand rig', armature)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, bone_cfg in cfg['hand']['bones'].items():
    bone=armature.edit_bones.new(name)
    bone.head=bone_cfg['head']; bone.tail=bone_cfg['tail']
    if bone_cfg.get('parent'): bone.parent=armature.edit_bones[bone_cfg['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
groups={name:hand.vertex_groups.new(name=name) for name in cfg['hand']['bones']}
face_bones={face:name for name,b in cfg['hand']['bones'].items() for face in b.get('faceSets',[])}
tips={name:Vector(b['tail']) for name,b in cfg['hand']['bones'].items() if name.endswith('-distal')}
for vertex in hand.data.vertices:
    weights=collections.defaultdict(float)
    for face in members[vertex.index]:
        if face in cfg['hand']['nailFaceSets']:
            name=min(tips, key=lambda n:(tips[n]-vertex.co).length_squared)
        else: name=face_bones.get(face, 'wrist')
        weights[name]+=1
    total=sum(weights.values())
    for name, weight in weights.items(): groups[name].add([vertex.index],weight/total,'REPLACE')

bpy.ops.object.select_all(action='DESELECT'); hand.select_set(True)
bpy.context.view_layer.objects.active=hand
for modifier in list(hand.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
modifier=hand.modifiers.new('final smooth surface', 'SUBSURF')
modifier.levels=cfg['hand']['extraSubdivision']; bpy.ops.object.modifier_apply(modifier=modifier.name)
for polygon in hand.data.polygons: polygon.use_smooth=True
modifier=hand.modifiers.new('anatomical articulation','ARMATURE'); modifier.object=rig
hand.parent=rig
hand['source']='Blender Studio Human Base Meshes 1.4.1 / Dan Ulrich / CC0'
save_glb([hand,rig],cfg['hand']['output'])

# Convert the independently MIT-licensed plate, with CC0 maps embedded in one GLB.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=local(cfg['cork']['input']),forward_axis='NEGATIVE_Z',up_axis='Y')
plate = [o for o in bpy.context.selected_objects if o.type=='MESH'][0]
plate.name='Campo cork shallow plate'
plate.data.materials.clear()
uv=plate.data.uv_layers.new(name='Material grain')
for polygon in plate.data.polygons:
    n=polygon.normal
    for loop_index in polygon.loop_indices:
        co=plate.data.vertices[plate.data.loops[loop_index].vertex_index].co
        if abs(n.z)>.55: a,b=co.x,co.y
        elif abs(n.x)>abs(n.y): a,b=co.y,co.z
        else: a,b=co.x,co.z
        uv.data[loop_index].uv=(a*cfg['cork']['grainScale']+.5,b*cfg['cork']['grainScale']+.5)
    polygon.use_smooth=True
mat=material('ambientCG Cork001 / CC0',(1,1,1),.88)
nodes=mat.node_tree.nodes; links=mat.node_tree.links; shader=nodes.get('Principled BSDF')
for role,filename in cfg['cork']['maps'].items():
    image=bpy.data.images.load(local(filename)); image.pack()
    tex=nodes.new('ShaderNodeTexImage'); tex.image=image
    if role!='color': image.colorspace_settings.name='Non-Color'
    if role=='color': links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    if role=='roughness': links.new(tex.outputs['Color'],shader.inputs['Roughness'])
    if role=='normal':
        normal=nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.9
        links.new(tex.outputs['Color'],normal.inputs['Color']); links.new(normal.outputs['Normal'],shader.inputs['Normal'])
plate.data.materials.append(mat)
plate['source']='Lusion ORYZO-1 / MIT geometry; ambientCG Cork001 / CC0 maps'
save_glb([plate],cfg['cork']['output'])
