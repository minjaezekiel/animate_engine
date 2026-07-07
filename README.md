

# Three.js Animation Engine Documentation

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Overview

The Three.js Animation Engine is a web-based 3D animation and modeling tool built with Three.js. It provides a comprehensive environment for creating, editing, and animating 3D scenes directly in the browser, with features for physics simulation, sculpting, and media integration.

## Features

### Core Functionality
- **3D Scene Creation**: Create and manipulate 3D objects including primitives (cube, sphere, cylinder, cone, torus, tetrahedron)
- **Lighting System**: Add and control various light types (point, spot, directional, ambient)
- **Material System**: Apply colors and materials to objects
- **Object Hierarchy**: Organize objects in groups and parent-child relationships
- **Transform Tools**: Move, rotate, and scale objects with visual gizmos
- **Sculpting Tools**: Modify mesh geometry with push, pull, smooth, ridge, pinch, and flatten tools
- **Physics Simulation**: Integrate physics properties (mass, friction, restitution) with Cannon.js
- **Animation System**: Create keyframe animations with timeline editing
- **Curve Editing**: Fine-tune animation interpolation curves
- **Media Integration**: Add background music, sound effects, and voice-overs
- **Recording & Export**: Record animations and export in various formats

### User Interface
- **Responsive Design**: Works on desktop and mobile devices
- **Tool Panels**: Organized panels for objects, editing, animation, recording, media, and export
- **Timeline**: Visual timeline for keyframe editing
- **Property Inspector**: Detailed controls for object properties
- **Context Menus**: Quick access to object actions
- **Notification System**: User-friendly feedback messages

## Current Status

### What Works
- Basic 3D scene creation and manipulation
- Object selection and transformation
- Primitive object creation
- Lighting system implementation
- Basic keyframe animation system
- Physics simulation with Cannon.js
- Sculpting tools with real-time mesh modification
- Media integration (audio loading and playback)
- Scene export/import functionality
- Animation export as JSON data
- Responsive UI with touch support
- **Export**: Downloadable **WebM** video (native `MediaRecorder`, with audio), animated **GIF** (built-in 3-3-2 + LZW encoder), and **image sequence** (PNG frames in a ZIP) — all dependency-free
- **State Management**: Undo/redo (Ctrl+Z / Ctrl+Shift+Z), project save/load, and localStorage autosave with restore-on-startup
- **Modeling**: `Subdivide` tool splits each triangle into four for denser geometry
- **Easing**: Set `animation.easing = 'smooth'` for cubic (curve) interpolation on position/scale
- **npm / CDN package**: importable via `require('animate-engine')` / `unpkg` / `jsDelivr`; auto-initializes only when a `#viewport` element is present
- **Programmatic API + MCP**: `engine.runCommands()` drives the engine from scripts; an MCP server (`mcp/`) lets an AI build and export animations autonomously — see [mcp/README.md](mcp/README.md)
- **Tests**: `npm test` runs the unit suite (`test/`) covering the encoders, packaging, and geometry utilities

### Requires Modification/Fixing
- **MP4 Export**: WebM/GIF/PNG-sequence are supported; MP4 would need a WASM encoder
- **Advanced Animation Features**: Inverse kinematics, bone rigging, and skinning are not implemented
- **Modeling**: Boolean operations, extrude, and bevel are not implemented (Subdivide is)
- **2D Animation**: The engine is 3D only; a 2D mode is not implemented
- **Collaboration Features**: No real-time collaboration capabilities
- **Advanced Materials**: Limited to basic color properties; no PBR materials or textures
- **Model Import**: Only supports GLTF format; needs additional format support
- **Physics Constraints**: Limited physics constraint options
- **Animation Blending**: No support for blending between animations

## Contributing

We welcome contributions to the Three.js Animation Engine! Here's how you can help:

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Areas for Contribution
- **UI/UX Improvements**: Enhance the user interface and experience
- **Performance Optimization**: Improve rendering performance and memory usage
- **New Features**: Implement missing features like advanced materials, undo/redo system
- **Bug Fixes**: Address issues in the issue tracker
- **Documentation**: Improve documentation and create tutorials
- **Testing**: Write tests to ensure code quality

### Code Style
- Follow the existing code style
- Use ES6+ features where appropriate
- Comment complex functionality
- Ensure responsive design for mobile devices

## Complex Methods Explained

### AnimationManager.createAnimationClip()
This method converts keyframe data into a Three.js AnimationClip that can be played by the AnimationMixer. It processes position, rotation, and scale keyframes separately, creating VectorKeyframeTracks and QuaternionKeyframeTracks as needed. The rotation keyframes are converted from Euler angles to quaternions to avoid gimbal lock issues.

```javascript
createAnimationClip(object, animation) {
    const uuid = object.uuid;
    const keyframes = animation.keyframes.get(uuid);
    
    if (!keyframes || keyframes.length === 0) {
        return null;
    }
    
    const tracks = [];
    
    // Process position keyframes
    const positionTimes = [];
    const positionValues = [];
    
    keyframes.forEach(kf => {
        if (kf.properties.position) {
            positionTimes.push(kf.time);
            positionValues.push(...kf.properties.position);
        }
    });
    
    if (positionTimes.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(
            `${object.uuid}.position`,
            positionTimes,
            positionValues
        ));
    }
    
    // Similar process for rotation and scale...
    
    return new THREE.AnimationClip(animation.name, animation.duration, tracks);
}
```

### EditManager.handleSculpting()
This method implements real-time mesh deformation based on user interaction. It uses raycasting to determine the point of interaction and applies sculpting operations to vertices within a specified radius. Different sculpting tools (push, pull, smooth, etc.) modify vertex positions in different ways.

```javascript
handleSculpting(event, object) {
    // Raycast to find intersection point
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.sceneManager.camera);
    const intersects = raycaster.intersectObject(object);
    
    if (intersects.length === 0) return;
    
    const point = intersects[0].point;
    const face = intersects[0].face;
    
    // Get face normal in world space
    const normal = new THREE.Vector3();
    normal.copy(face.normal);
    normal.transformDirection(object.matrixWorld);
    
    // Modify vertices within sculpt radius
    const positions = object.geometry.attributes.position.array;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positions.length; i += 3) {
        vertex.set(positions[i], positions[i + 1], positions[i + 2]);
        vertex.applyMatrix4(object.matrixWorld);
        
        const distance = vertex.distanceTo(point);
        
        if (distance < this.sculptSize) {
            const influence = 1 - (distance / this.sculptSize);
            const strength = this.sculptStrength * influence * 0.1;
            
            // Apply sculpting based on selected tool
            if (this.sculptTool === 'push') {
                vertex.sub(normal.clone().multiplyScalar(strength));
            } else if (this.sculptTool === 'pull') {
                vertex.add(normal.clone().multiplyScalar(strength));
            }
            // Other tools...
            
            // Convert back to local space and update
            vertex.applyMatrix4(new THREE.Matrix4().getInverse(object.matrixWorld));
            positions[i] = vertex.x;
            positions[i + 1] = vertex.y;
            positions[i + 2] = vertex.z;
        }
    }
    
    // Update geometry
    object.geometry.attributes.position.needsUpdate = true;
    object.geometry.computeVertexNormals();
}
```

### SceneManager.importModel()
This method handles importing 3D models in GLTF format. It uses the Three.js GLTFLoader to parse the model data, adds it to the scene, and processes any animations included with the model.

```javascript
importModel(file, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const contents = event.target.result;
        
        const loader = new THREE.GLTFLoader();
        
        try {
            loader.parse(contents, '', (gltf) => {
                const model = gltf.scene;
                
                // Add model to scene
                this.addObject(model, file.name.replace(/\.[^/.]+$/, ""));
                
                // Process animations if available
                if (gltf.animations && gltf.animations.length > 0) {
                    gltf.animations.forEach((clip, index) => {
                        const animationName = clip.name || `Animation_${index + 1}`;
                        this.animationManager.createAnimation(animationName, clip.duration, 'repeat');
                        this.animationManager.animationClips.set(animationName, clip);
                    });
                }
                
                // Set up model properties
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        this.objects.set(child.uuid, child);
                        this.objectProperties.set(child.uuid, {
                            visible: true,
                            locked: false,
                            physicsEnabled: false
                        });
                    }
                });
                
                callback(true, model);
            }, (error) => {
                console.error('Error parsing GLTF:', error);
                callback(false, null);
            });
        } catch (error) {
            console.error('Error loading model:', error);
            callback(false, null);
        }
    };
    
    reader.readAsArrayBuffer(file);
}
```

## Basic Usage

### Creating a Simple Animation

1. **Create a Scene Object**
   ```javascript
   // Create a cube
   const cube = sceneManager.createCube("My Cube");
   sceneManager.selectObject(cube);
   ```

2. **Add Keyframes**
   ```javascript
   // Select or create an animation
   animationManager.createAnimation("Cube Animation", 5, "repeat");
   animationManager.selectAnimation("Cube Animation");
   
   // Add keyframes at different times
   animationManager.setCurrentTime(0);
   animationManager.addKeyframe(cube, 0, {
       position: [0, 0, 0],
       rotation: [0, 0, 0],
       scale: [1, 1, 1]
   });
   
   animationManager.setCurrentTime(2);
   cube.position.x = 5;
   animationManager.addKeyframe(cube, 2, {
       position: [5, 0, 0],
       rotation: [0, Math.PI, 0],
       scale: [1, 1, 1]
   });
   
   animationManager.setCurrentTime(4);
   cube.position.x = 0;
   animationManager.addKeyframe(cube, 4, {
       position: [0, 0, 0],
       rotation: [0, Math.PI * 2, 0],
       scale: [1, 1, 1]
   });
   ```

3. **Play the Animation**
   ```javascript
   animationManager.play();
   ```

### Adding Physics to an Object

```javascript
// Select an object
const sphere = sceneManager.createSphere("Bouncing Ball");
sceneManager.selectObject(sphere);

// Enable physics
const properties = sceneManager.getObjectProperties(sphere.uuid);
properties.physicsEnabled = true;
properties.mass = 1;
properties.restitution = 0.8; // Bounciness
sceneManager.setObjectProperties(sphere.uuid, properties);

// Add to physics world
physicsManager.addObject(sphere, properties);
```

### Sculpting a Mesh

```javascript
// Select a sculpting tool
editManager.setTool('sculpt');
editManager.setSculptTool('push');

// Adjust sculpting parameters
editManager.sculptSize = 0.8;
editManager.sculptStrength = 1.2;

// Perform sculpting (usually done through UI interaction)
// The handleSculpting method would be called during mouse/touch events
```

## Future Development

### AI Text-to-Prompt Animation Generation
We plan to implement an AI-powered text-to-prompt system that will allow users to generate animations through natural language descriptions. This feature will:

1. Parse user input to understand animation requirements
2. Generate appropriate 3D scenes and objects based on the description
3. Create plausible animations that match the user's intent
4. Provide options for refinement and customization

Example: A user might type "A bouncing ball that changes color when it hits the ground," and the system would generate a scene with a ball, apply physics properties, create keyframes for the bouncing motion, and add color change animations at impact points.

### Planned Features

1. **Advanced Animation Tools**
   - Inverse kinematics for character animation
   - Bone rigging and skinning system
   - Morph targets for facial animation
   - Animation blending and layering

2. **Enhanced Materials and Textures**
   - PBR (Physically Based Rendering) materials
   - Texture painting tools
   - Procedural texture generation
   - UV mapping tools

3. **Improved Modeling Tools**
   - Boolean operations
   - Bevel and extrude tools
   - Subdivision surface modeling
   - Parametric modeling

4. **Visual Effects**
   - Particle systems
   - Fluid simulation
   - Cloth simulation
   - Post-processing effects

5. **Collaboration Features**
   - Real-time multi-user editing
   - Version control system
   - Cloud storage integration
   - Comment and review system

6. **Performance Enhancements**
   - WebGL 2.0 support
   - WebAssembly integration for heavy computations
   - Level of detail (LOD) systems
   - Occlusion culling

7. **Export Options**
   - Video export with encoding
   - GIF export with optimization
   - WebGL application export
   - 3D model export in multiple formats

8. **Integration Capabilities**
   - Plugin system for extensibility
   - API for external application integration
   - VR/AR support
   - Import/export to professional animation formats

## Conclusion

The Three.js Animation Engine provides a solid foundation for browser-based 3D animation creation. While it already offers a comprehensive set of features for basic animation and modeling tasks, there are many opportunities for enhancement and expansion. We welcome contributions from the community to help realize the full potential of this project and make it a powerful tool for 3D animation on the web.