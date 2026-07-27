/**
 * AE-MCP Stdio Server
 *
 * MCP server implementation using stdio transport.
 * Handles all tool definitions and communication with After Effects.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { FileCommunicator } from './ae-integration/file-communicator.js';
import * as generators from './ae-integration/scriptGenerator.js';
import { createErrorResponse } from './ae-integration/errorHandler.js';
import { Logger } from './types/mcpTypes.js';

// Create logger
const logger: Logger = {
  debug: (msg, meta) => console.error(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
  info: (msg, meta) => console.error(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta) => console.error(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : '')
};

// Tool definitions
const TOOLS = [
  // ============================================
  // PROJECT TOOLS
  // ============================================
  {
    name: 'create_project',
    description: 'Create a new After Effects project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional project name' }
      }
    },
    generator: generators.generateCreateProject
  },
  {
    name: 'open_project',
    description: 'Open an existing After Effects project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project file' }
      },
      required: ['path']
    },
    generator: generators.generateOpenProject
  },
  {
    name: 'save_project',
    description: 'Save the current project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional path to save as' }
      }
    },
    generator: generators.generateSaveProject
  },
  {
    name: 'close_project',
    description: 'Close the current project',
    inputSchema: {
      type: 'object',
      properties: {
        save: { type: 'boolean', description: 'Save before closing' }
      }
    },
    generator: generators.generateCloseProject
  },
  {
    name: 'get_project_info',
    description: 'Get information about the current project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateGetProjectInfo
  },
  {
    name: 'import_footage',
    description: 'Import footage file into the project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to import' },
        name: { type: 'string', description: 'Optional name for the imported item' },
        sequence: { type: 'boolean', description: 'Import as image sequence' },
        forceAlphabetical: { type: 'boolean', description: 'Force alphabetical order for sequences' }
      },
      required: ['path']
    },
    generator: generators.generateImportFootage
  },

  // ============================================
  // COMPOSITION TOOLS
  // ============================================
  {
    name: 'create_composition',
    description: 'Create a new composition',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Composition name' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        frameRate: { type: 'number', description: 'Frame rate' },
        duration: { type: 'number', description: 'Duration in seconds' },
        backgroundColor: {
          type: 'object',
          properties: {
            r: { type: 'number' },
            g: { type: 'number' },
            b: { type: 'number' }
          },
          description: 'Background color (0-1 range)'
        }
      },
      required: ['name', 'width', 'height', 'frameRate', 'duration']
    },
    generator: generators.generateCreateComposition
  },
  {
    name: 'modify_composition',
    description: 'Modify an existing composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name (alternative to ID)' },
        name: { type: 'string', description: 'New name' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
        frameRate: { type: 'number', description: 'New frame rate' },
        duration: { type: 'number', description: 'New duration' },
        backgroundColor: { type: 'object', description: 'New background color' }
      }
    },
    generator: generators.generateModifyComposition
  },
  {
    name: 'duplicate_composition',
    description: 'Duplicate a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        newName: { type: 'string', description: 'Name for the duplicate' }
      }
    },
    generator: generators.generateDuplicateComposition
  },
  {
    name: 'delete_composition',
    description: 'Delete a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' }
      }
    },
    generator: generators.generateDeleteComposition
  },
  {
    name: 'list_compositions',
    description: 'List all compositions in the project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateListCompositions
  },
  {
    name: 'get_composition_info',
    description: 'Get detailed information about a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' }
      }
    },
    generator: generators.generateGetCompositionInfo
  },
  {
    name: 'render_frame',
    description: 'Render a single frame of a composition to a PNG file on disk. Returns the file path so the AI can inspect what the comp actually looks like.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        time: { type: 'number', description: 'Time in seconds of the frame to render' },
        outputDir: { type: 'string', description: 'Output folder (default: ~/Desktop/ae_probe)' },
        fileName: { type: 'string', description: 'Output file name (default: <comp>_t<time>s.png)' }
      },
      required: ['time']
    },
    generator: generators.generateRenderFrame
  },
  {
    name: 'get_comp_report',
    description: 'Full composition report: every layer with geometry, text data, fonts (used vs installed), expressions, keyframes, and animated values sampled over time (at markers by default). Use it to verify the real state of a comp.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        sampleTimes: { type: 'array', items: { type: 'number' }, description: 'Times in seconds to sample animated values (default: comp markers, else 5 uniform points)' },
        textPreview: { type: 'number', description: 'Max characters of text per layer (default 120)' }
      }
    },
    generator: generators.generateGetCompReport
  },

  // ============================================
  // LAYER TOOLS
  // ============================================
  {
    name: 'add_solid_layer',
    description: 'Add a solid color layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        name: { type: 'string', description: 'Layer name' },
        color: {
          type: 'object',
          properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' } },
          description: 'Color (0-1 range)'
        },
        width: { type: 'number', description: 'Width (defaults to comp width)' },
        height: { type: 'number', description: 'Height (defaults to comp height)' },
        duration: { type: 'number', description: 'Duration in seconds' },
        startTime: { type: 'number', description: 'Start time in seconds' }
      },
      required: ['name', 'color']
    },
    generator: generators.generateAddSolidLayer
  },
  {
    name: 'add_text_layer',
    description: 'Add a text layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        text: { type: 'string', description: 'Text content' },
        name: { type: 'string', description: 'Layer name' },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        fontSize: { type: 'number', description: 'Font size in pixels' },
        fontFamily: { type: 'string', description: 'Font family name' },
        color: { type: 'object', description: 'Text color (0-1 range)' },
        justification: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'] }
      },
      required: ['text']
    },
    generator: generators.generateAddTextLayer
  },
  {
    name: 'add_text_layer_advanced',
    description: 'Add a text layer with advanced styling options',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        text: { type: 'string', description: 'Text content' },
        name: { type: 'string' },
        position: { type: 'object' },
        fontSize: { type: 'number' },
        fontFamily: { type: 'string' },
        color: { type: 'object' },
        justification: { type: 'string' },
        tracking: { type: 'number', description: 'Letter spacing' },
        leading: { type: 'number', description: 'Line height' },
        baselineShift: { type: 'number' },
        strokeColor: { type: 'object' },
        strokeWidth: { type: 'number' },
        strokeOverFill: { type: 'boolean' }
      },
      required: ['text']
    },
    generator: generators.generateAddTextLayerAdvanced
  },
  {
    name: 'add_shape_layer',
    description: 'Add a shape layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' },
        shape: { type: 'string', enum: ['rectangle', 'ellipse', 'polygon', 'star'], description: 'Shape type' },
        size: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
        position: { type: 'object' },
        fillColor: { type: 'object', description: 'Fill color (0-1 range)' },
        strokeColor: { type: 'object', description: 'Stroke color (0-1 range)' },
        strokeWidth: { type: 'number' },
        points: { type: 'number', description: 'Number of points for polygon/star' },
        innerRadius: { type: 'number', description: 'Inner radius for star' },
        outerRadius: { type: 'number', description: 'Outer radius for polygon/star' }
      }
    },
    generator: generators.generateAddShapeLayer
  },
  {
    name: 'add_null_layer',
    description: 'Add a null object layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' }
      }
    },
    generator: generators.generateAddNullLayer
  },
  {
    name: 'add_adjustment_layer',
    description: 'Add an adjustment layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' }
      }
    },
    generator: generators.generateAddAdjustmentLayer
  },
  {
    name: 'add_camera_layer',
    description: 'Add a camera layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['ONE_NODE', 'TWO_NODE'] },
        zoom: { type: 'number' }
      }
    },
    generator: generators.generateAddCameraLayer
  },
  {
    name: 'add_light_layer',
    description: 'Add a light layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['PARALLEL', 'SPOT', 'POINT', 'AMBIENT'] },
        color: { type: 'object' },
        intensity: { type: 'number' }
      }
    },
    generator: generators.generateAddLightLayer
  },
  {
    name: 'add_av_layer',
    description: 'Add a footage item as a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        itemId: { type: 'number', description: 'Project item ID' },
        itemName: { type: 'string', description: 'Project item name' },
        startTime: { type: 'number' }
      }
    },
    generator: generators.generateAddAVLayer
  },
  {
    name: 'precompose_layers',
    description: 'Precompose selected layers into a new composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndices: { type: 'array', items: { type: 'number' }, description: 'Layer indices to precompose' },
        name: { type: 'string', description: 'Name for the new precomp' },
        moveAttributes: { type: 'boolean', description: 'Move attributes to new comp' }
      },
      required: ['layerIndices', 'name']
    },
    generator: generators.generatePrecomposeLayers
  },
  {
    name: 'modify_layer',
    description: 'Modify layer properties',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        solo: { type: 'boolean' },
        shy: { type: 'boolean' },
        locked: { type: 'boolean' },
        inPoint: { type: 'number' },
        outPoint: { type: 'number' },
        startTime: { type: 'number' },
        stretch: { type: 'number' },
        blendMode: { type: 'string' },
        parent: { type: 'number' },
        is3D: { type: 'boolean' },
        position: { type: 'object' },
        scale: { type: 'array', items: { type: 'number' } },
        rotation: { type: 'number' },
        opacity: { type: 'number' }
      }
    },
    generator: generators.generateModifyLayer
  },
  {
    name: 'delete_layer',
    description: 'Delete a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateDeleteLayer
  },
  {
    name: 'list_layers',
    description: 'List all layers in a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateListLayers
  },
  {
    name: 'get_layer_info',
    description: 'Get detailed information about a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateGetLayerInfo
  },

  // ============================================
  // KEYFRAME TOOLS
  // ============================================
  {
    name: 'set_keyframe',
    description: 'Set a keyframe on a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string', description: 'Property name (e.g., "position", "scale", "opacity")' },
        time: { type: 'number', description: 'Time in seconds' },
        value: {
          oneOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' } },
            { type: 'string' }
          ],
          description: 'Property value: number, array of numbers (e.g. [540, 960]), or string'
        }
      },
      required: ['property', 'time', 'value']
    },
    generator: generators.generateSetKeyframe
  },
  {
    name: 'set_keyframe_advanced',
    description: 'Set a keyframe with easing options',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        time: { type: 'number' },
        value: {
          oneOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' } },
            { type: 'string' }
          ],
          description: 'Property value: number, array of numbers, or string'
        },
        inType: { type: 'string', enum: ['LINEAR', 'BEZIER', 'HOLD'] },
        outType: { type: 'string', enum: ['LINEAR', 'BEZIER', 'HOLD'] },
        inEase: { type: 'object', properties: { speed: { type: 'number' }, influence: { type: 'number' } } },
        outEase: { type: 'object', properties: { speed: { type: 'number' }, influence: { type: 'number' } } }
      },
      required: ['property', 'time', 'value']
    },
    generator: generators.generateSetKeyframeAdvanced
  },
  {
    name: 'apply_easy_ease',
    description: 'Apply easy ease to keyframes',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        keyframeIndex: { type: 'number', description: 'Specific keyframe (optional, applies to all if omitted)' },
        type: { type: 'string', enum: ['IN', 'OUT', 'BOTH'] }
      },
      required: ['property']
    },
    generator: generators.generateApplyEasyEase
  },
  {
    name: 'set_temporal_ease',
    description: 'Set temporal ease on a keyframe',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        keyframeIndex: { type: 'number' },
        inSpeed: { type: 'number' },
        inInfluence: { type: 'number' },
        outSpeed: { type: 'number' },
        outInfluence: { type: 'number' }
      },
      required: ['property', 'keyframeIndex']
    },
    generator: generators.generateSetTemporalEase
  },
  {
    name: 'offset_keyframes',
    description: 'Offset all keyframes in time',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        offset: { type: 'number', description: 'Time offset in seconds' }
      },
      required: ['property', 'offset']
    },
    generator: generators.generateOffsetKeyframes
  },
  {
    name: 'scale_keyframe_timing',
    description: 'Scale keyframe timing (speed up or slow down)',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        scale: { type: 'number', description: 'Scale factor (2 = twice as slow, 0.5 = twice as fast)' },
        anchorTime: { type: 'number', description: 'Anchor point for scaling' }
      },
      required: ['property', 'scale']
    },
    generator: generators.generateScaleKeyframeTiming
  },
  {
    name: 'reverse_keyframes',
    description: 'Reverse keyframe order',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateReverseKeyframes
  },
  {
    name: 'copy_keyframes',
    description: 'Copy keyframes from one property to another',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        sourceProperty: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        targetProperty: { type: 'string' },
        timeOffset: { type: 'number' }
      },
      required: ['sourceProperty']
    },
    generator: generators.generateCopyKeyframes
  },
  {
    name: 'get_keyframes',
    description: 'Get all keyframes from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateGetKeyframes
  },

  // ============================================
  // EXPRESSION TOOLS
  // ============================================
  {
    name: 'set_expression',
    description: 'Set an expression on a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        expression: { type: 'string', description: 'JavaScript expression' }
      },
      required: ['property', 'expression']
    },
    generator: generators.generateSetExpression
  },
  {
    name: 'get_expression',
    description: 'Get the expression from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateGetExpression
  },
  {
    name: 'remove_expression',
    description: 'Remove expression from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateRemoveExpression
  },
  {
    name: 'enable_expression',
    description: 'Enable or disable an expression',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        enabled: { type: 'boolean' }
      },
      required: ['property', 'enabled']
    },
    generator: generators.generateEnableExpression
  },
  {
    name: 'add_expression_control',
    description: 'Add an expression control effect to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        controlType: { type: 'string', enum: ['slider', 'color', 'point', 'checkbox', 'dropdown', 'angle', 'layer'] },
        controlName: { type: 'string' },
        defaultValue: {}
      },
      required: ['controlType', 'controlName']
    },
    generator: generators.generateAddExpressionControl
  },
  {
    name: 'apply_expression_template',
    description: 'Apply a pre-built expression template',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        template: {
          type: 'string',
          enum: [
            'wiggle', 'wiggleSmooth', 'wiggleFadeIn', 'wiggleFadeOut',
            'loopCycle', 'loopPingpong', 'loopOffset', 'loopContinue',
            'time', 'clock', 'countdown', 'frameNumber',
            'matchPosition', 'offsetPosition', 'inverseRotation', 'followPath',
            'bounce', 'inertia', 'overshoot', 'springy'
          ]
        },
        params: { type: 'object', description: 'Template parameters' }
      },
      required: ['property', 'template']
    },
    generator: generators.generateApplyExpressionTemplate
  },
  {
    name: 'link_properties',
    description: 'Link two properties with an expression',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        sourceProperty: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        targetProperty: { type: 'string' },
        offset: { description: 'Offset value (number or array)' }
      },
      required: ['sourceProperty', 'targetProperty']
    },
    generator: generators.generateLinkProperties
  },

  // ============================================
  // EFFECT TOOLS
  // ============================================
  {
    name: 'apply_effect',
    description: 'Apply an effect to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effect: { type: 'string', description: 'Effect name or match name' },
        properties: { type: 'object', description: 'Effect property values' }
      },
      required: ['effect']
    },
    generator: generators.generateApplyEffect
  },
  {
    name: 'apply_effect_template',
    description: 'Apply a pre-configured effect template',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        template: {
          type: 'string',
          enum: [
            'gaussianBlur', 'directionalBlur', 'glassBlur',
            'curves', 'colorBalance', 'brightnessContrast', 'vibrance',
            'glow', 'dropShadow', 'vignette',
            'cinematicLook', 'vhsRetro', 'neonGlow', 'filmGrain',
            'chromaticAberration', 'duotone'
          ]
        },
        intensity: { type: 'number', description: 'Effect intensity (0-100)' },
        customParams: { type: 'object', description: 'Custom effect parameters' }
      },
      required: ['template']
    },
    generator: generators.generateApplyEffectTemplate
  },
  {
    name: 'modify_effect_properties',
    description: 'Modify properties of an existing effect',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        effectName: { type: 'string' },
        properties: { type: 'object' }
      },
      required: ['properties']
    },
    generator: generators.generateModifyEffectProperties
  },
  {
    name: 'remove_effect',
    description: 'Remove an effect from a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        effectName: { type: 'string' }
      }
    },
    generator: generators.generateRemoveEffect
  },
  {
    name: 'reorder_effects',
    description: 'Reorder effects on a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        newIndex: { type: 'number' }
      },
      required: ['effectIndex', 'newIndex']
    },
    generator: generators.generateReorderEffects
  },
  {
    name: 'copy_effects',
    description: 'Copy effects from one layer to another',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        effectIndices: { type: 'array', items: { type: 'number' } }
      }
    },
    generator: generators.generateCopyEffects
  },
  {
    name: 'list_effects',
    description: 'List all effects on a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateListEffects
  },

  // ============================================
  // TEMPLATE TOOLS (Motion Graphics)
  // ============================================
  {
    name: 'create_lower_third',
    description: 'Create a lower third graphic with animated text',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        style: { type: 'string', enum: ['modern', 'corporate', 'news', 'minimal', 'social'] },
        name: { type: 'string', description: 'Person/entity name' },
        title: { type: 'string', description: 'Title/role' },
        subtitle: { type: 'string', description: 'Optional subtitle' },
        duration: { type: 'number', description: 'Duration in seconds' },
        animateIn: { type: 'boolean' },
        animateOut: { type: 'boolean' },
        primaryColor: { type: 'object' },
        secondaryColor: { type: 'object' },
        textColor: { type: 'object' },
        position: { type: 'string', enum: ['bottomLeft', 'bottomRight', 'bottomCenter'] }
      },
      required: ['style', 'name', 'title']
    },
    generator: generators.generateCreateLowerThird
  },
  {
    name: 'create_title_card',
    description: 'Create a title card with animations',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        style: { type: 'string', enum: ['cinematic', 'documentary', 'social', 'minimal'] },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        duration: { type: 'number' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number' },
        color: { type: 'object' },
        backgroundColor: { type: 'object' }
      },
      required: ['style', 'title']
    },
    generator: generators.generateCreateTitleCard
  },
  {
    name: 'create_transition',
    description: 'Create a transition effect layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        type: { type: 'string', enum: ['wipe_left', 'wipe_right', 'wipe_up', 'wipe_down', 'dissolve', 'push', 'slide', 'zoom'] },
        duration: { type: 'number' },
        easing: { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'easeInOut'] },
        color: { type: 'object' }
      },
      required: ['type']
    },
    generator: generators.generateCreateTransition
  },
  {
    name: 'create_logo_reveal',
    description: 'Create an animated logo reveal',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        logoItemId: { type: 'number', description: 'Project item ID of logo' },
        logoItemName: { type: 'string', description: 'Project item name of logo' },
        style: { type: 'string', enum: ['fade', 'scale', 'slide', 'spin', 'glitch', 'particle'] },
        duration: { type: 'number' },
        backgroundColor: { type: 'object' }
      }
    },
    generator: generators.generateCreateLogoReveal
  },
  {
    name: 'create_text_animator',
    description: 'Add a text animator to a text layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        animatorType: { type: 'string', enum: ['typewriter', 'fadeInChars', 'scaleInChars', 'slideInChars', 'randomize', 'wave'] },
        duration: { type: 'number' },
        delay: { type: 'number', description: 'Delay between characters' }
      },
      required: ['animatorType']
    },
    generator: generators.generateCreateTextAnimator
  },

  // ============================================
  // ASSET TOOLS
  // ============================================
  {
    name: 'import_folder',
    description: 'Import all files from a folder',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path' },
        recursive: { type: 'boolean', description: 'Include subfolders' }
      },
      required: ['path']
    },
    generator: generators.generateImportFolder
  },
  {
    name: 'replace_footage',
    description: 'Replace footage item with a new file',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'number' },
        itemName: { type: 'string' },
        newPath: { type: 'string', description: 'Path to new footage file' }
      },
      required: ['newPath']
    },
    generator: generators.generateReplaceFootage
  },
  {
    name: 'organize_project_items',
    description: 'Organize project items into folders',
    inputSchema: {
      type: 'object',
      properties: {
        structure: { type: 'string', enum: ['type', 'usage', 'custom'] },
        customFolders: { type: 'array', items: { type: 'string' } }
      }
    },
    generator: generators.generateOrganizeProjectItems
  },
  {
    name: 'find_missing_footage',
    description: 'Find all missing footage items in the project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateFindMissingFootage
  },
  {
    name: 'collect_files',
    description: 'Collect project files to a folder',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Output folder path' },
        includeFootage: { type: 'boolean' },
        includeFonts: { type: 'boolean' }
      },
      required: ['outputPath']
    },
    generator: generators.generateCollectFiles
  },
  {
    name: 'reduce_project',
    description: 'Remove unused items from project',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateReduceProject
  },

  // ============================================
  // MARKER TOOLS
  // ============================================
  {
    name: 'add_composition_marker',
    description: 'Add a marker to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        time: { type: 'number', description: 'Time in seconds' },
        comment: { type: 'string' },
        duration: { type: 'number' },
        chapter: { type: 'string' },
        url: { type: 'string' },
        frameTarget: { type: 'string' },
        cuePointName: { type: 'string' }
      },
      required: ['time']
    },
    generator: generators.generateAddCompositionMarker
  },
  {
    name: 'add_layer_marker',
    description: 'Add a marker to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        time: { type: 'number' },
        comment: { type: 'string' },
        duration: { type: 'number' }
      },
      required: ['time']
    },
    generator: generators.generateAddLayerMarker
  },
  {
    name: 'get_markers',
    description: 'Get all markers from a composition or layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateGetMarkers
  },
  {
    name: 'delete_marker',
    description: 'Delete a marker',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        markerIndex: { type: 'number' }
      },
      required: ['markerIndex']
    },
    generator: generators.generateDeleteMarker
  },
  {
    name: 'set_work_area',
    description: 'Set the work area of a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        start: { type: 'number', description: 'Start time in seconds' },
        duration: { type: 'number', description: 'Duration in seconds' }
      },
      required: ['start', 'duration']
    },
    generator: generators.generateSetWorkArea
  }
];

// Create tool lookup map
const toolMap = new Map<string, typeof TOOLS[0]>();
TOOLS.forEach(tool => toolMap.set(tool.name, tool));

// Create communicator
const communicator = new FileCommunicator({ logger });

// Create MCP server
const server = new Server(
  {
    name: 'ae-mcp',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` })
        }
      ],
      isError: true
    };
  }

  try {
    // Generate the script
    const script = tool.generator(args as any || {});

    // Execute in After Effects
    const result = await communicator.executeScript(script);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result)
        }
      ],
      isError: !result.success
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error instanceof Error ? error : String(error));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse)
        }
      ],
      isError: true
    };
  }
});

// List resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'ae://project/current',
        name: 'Current Project',
        description: 'Information about the current After Effects project',
        mimeType: 'application/json'
      },
      {
        uri: 'ae://compositions',
        name: 'Compositions',
        description: 'List of all compositions in the project',
        mimeType: 'application/json'
      }
    ]
  };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let script: string;

    if (uri === 'ae://project/current') {
      script = generators.generateGetProjectInfo();
    } else if (uri === 'ae://compositions') {
      script = generators.generateListCompositions();
    } else {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Unknown resource' })
          }
        ]
      };
    }

    const result = await communicator.executeScript(script);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.data || result)
        }
      ]
    };
  } catch (error) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: String(error) })
        }
      ]
    };
  }
});

// List prompts handler
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'create-animation',
        description: 'Create an animated composition with common motion graphics elements'
      },
      {
        name: 'setup-project',
        description: 'Set up a new project with standard folder structure'
      }
    ]
  };
});

// Get prompt handler
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'create-animation') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Help me create an animated composition. I want to add text with entrance animations, shapes, and smooth transitions.'
          }
        }
      ]
    };
  } else if (name === 'setup-project') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Set up a new After Effects project with organized folders for footage, compositions, and precomps.'
          }
        }
      ]
    };
  }

  return {
    messages: []
  };
});

// Main entry point
async function main() {
  logger.info('Starting AE-MCP server...');

  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('AE-MCP server running');
}

main().catch((error) => {
  logger.error('Fatal error', { error: String(error) });
  process.exit(1);
});
