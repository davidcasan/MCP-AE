/**
 * Expression-related Script Generators
 *
 * Generates ES3-compatible ExtendScript for expression operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  generatePropertyAccess,
  wrapInUndoGroup,
  generateResultObject
} from './helpers.js';

// Expression templates library
const EXPRESSION_TEMPLATES: Record<string, {
  expression: string;
  description: string;
  params?: Record<string, { type: string; default: any; description: string }>;
}> = {
  // Wiggle expressions
  wiggle: {
    expression: 'wiggle({{frequency}}, {{amplitude}})',
    description: 'Basic wiggle effect',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' }
    }
  },
  wiggleSmooth: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar octaves = {{octaves}};\nvar mult = {{mult}};\nvar time_offset = {{timeOffset}};\nwiggle(freq, amp, octaves, mult, time + time_offset)',
    description: 'Smooth wiggle with octaves',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      octaves: { type: 'number', default: 1, description: 'Noise octaves' },
      mult: { type: 'number', default: 0.5, description: 'Amplitude multiplier' },
      timeOffset: { type: 'number', default: 0, description: 'Time offset' }
    }
  },
  wiggleFadeIn: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar fadeTime = {{fadeTime}};\nvar t = Math.min(time / fadeTime, 1);\nwiggle(freq, amp * t)',
    description: 'Wiggle that fades in over time',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      fadeTime: { type: 'number', default: 1, description: 'Fade in duration (seconds)' }
    }
  },
  wiggleFadeOut: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar fadeTime = {{fadeTime}};\nvar fadeStart = {{fadeStart}};\nvar t = Math.max(0, 1 - (time - fadeStart) / fadeTime);\nwiggle(freq, amp * t)',
    description: 'Wiggle that fades out over time',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      fadeTime: { type: 'number', default: 1, description: 'Fade out duration (seconds)' },
      fadeStart: { type: 'number', default: 2, description: 'Start time for fade out' }
    }
  },

  // Loop expressions
  loopCycle: {
    expression: 'loopOut("cycle")',
    description: 'Loop keyframes in a cycle'
  },
  loopPingpong: {
    expression: 'loopOut("pingpong")',
    description: 'Loop keyframes ping-pong style'
  },
  loopOffset: {
    expression: 'loopOut("offset")',
    description: 'Loop keyframes with continuous offset'
  },
  loopContinue: {
    expression: 'loopOut("continue")',
    description: 'Continue last keyframe velocity'
  },

  // Time expressions
  time: {
    expression: 'time',
    description: 'Current time in seconds'
  },
  clock: {
    expression: 'var d = new Date();\nvar h = d.getHours();\nvar m = d.getMinutes();\nvar s = d.getSeconds();\n(h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s',
    description: 'Current time as HH:MM:SS'
  },
  countdown: {
    expression: 'var total = {{totalSeconds}};\nvar remaining = Math.max(0, total - time);\nvar m = Math.floor(remaining / 60);\nvar s = Math.floor(remaining % 60);\n(m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s',
    description: 'Countdown timer',
    params: {
      totalSeconds: { type: 'number', default: 60, description: 'Total countdown time in seconds' }
    }
  },
  frameNumber: {
    expression: 'Math.floor(time * {{frameRate}}) + {{offset}}',
    description: 'Current frame number',
    params: {
      frameRate: { type: 'number', default: 30, description: 'Frames per second' },
      offset: { type: 'number', default: 1, description: 'Starting frame number' }
    }
  },

  // Linking expressions
  matchPosition: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\ntargetLayer.transform.position',
    description: 'Match position of another layer',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' }
    }
  },
  offsetPosition: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\nvar offset = [{{offsetX}}, {{offsetY}}];\ntargetLayer.transform.position + offset',
    description: 'Offset from another layer position',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' },
      offsetX: { type: 'number', default: 100, description: 'X offset' },
      offsetY: { type: 'number', default: 0, description: 'Y offset' }
    }
  },
  inverseRotation: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\n-targetLayer.transform.rotation',
    description: 'Inverse rotation of another layer',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' }
    }
  },
  followPath: {
    expression: 'var pathLayer = thisComp.layer("{{pathLayer}}");\nvar path = pathLayer.content("{{shapeName}}").path;\nvar progress = {{progress}};\npath.pointOnPath(progress)',
    description: 'Follow a path shape',
    params: {
      pathLayer: { type: 'string', default: 'Path Layer', description: 'Layer containing the path' },
      shapeName: { type: 'string', default: 'Path 1', description: 'Name of the shape path' },
      progress: { type: 'string', default: 'time / thisComp.duration', description: 'Progress expression (0-1)' }
    }
  },

  // Physics expressions
  bounce: {
    expression: 'var amplitude = {{amplitude}};\nvar frequency = {{frequency}};\nvar decay = {{decay}};\nvar numKeys = numKeys;\nif (numKeys > 0) {\n  var t = time - key(numKeys).time;\n  if (t > 0) {\n    var v = velocityAtTime(key(numKeys).time - 0.001);\n    value + v * amplitude * Math.sin(frequency * t * 2 * Math.PI) / Math.exp(decay * t);\n  } else {\n    value;\n  }\n} else {\n  value;\n}',
    description: 'Bouncy overshoot after keyframes',
    params: {
      amplitude: { type: 'number', default: 0.1, description: 'Bounce amplitude' },
      frequency: { type: 'number', default: 3, description: 'Bounce frequency' },
      decay: { type: 'number', default: 5, description: 'Decay rate' }
    }
  },
  inertia: {
    expression: 'var friction = {{friction}};\nvar numKeys = numKeys;\nif (numKeys > 0) {\n  var t = time - key(numKeys).time;\n  if (t > 0) {\n    var v = velocityAtTime(key(numKeys).time - 0.001);\n    value + v * (1 - Math.exp(-friction * t)) / friction;\n  } else {\n    value;\n  }\n} else {\n  value;\n}',
    description: 'Inertia/momentum after keyframes',
    params: {
      friction: { type: 'number', default: 5, description: 'Friction coefficient' }
    }
  },
  overshoot: {
    expression: 'var frequency = {{frequency}};\nvar decay = {{decay}};\nvar numKeys = numKeys;\nif (numKeys > 0) {\n  var t = time - key(numKeys).time;\n  if (t > 0) {\n    var startVal = key(numKeys).value;\n    var endVal = value;\n    var delta = endVal - startVal;\n    endVal + delta * Math.sin(frequency * t * Math.PI) * Math.exp(-decay * t);\n  } else {\n    value;\n  }\n} else {\n  value;\n}',
    description: 'Overshoot animation effect',
    params: {
      frequency: { type: 'number', default: 3, description: 'Oscillation frequency' },
      decay: { type: 'number', default: 5, description: 'Decay rate' }
    }
  },
  springy: {
    expression: 'var mass = {{mass}};\nvar stiffness = {{stiffness}};\nvar damping = {{damping}};\nvar numKeys = numKeys;\nif (numKeys > 0) {\n  var t = time - key(numKeys).time;\n  if (t > 0) {\n    var omega = Math.sqrt(stiffness / mass);\n    var zeta = damping / (2 * Math.sqrt(mass * stiffness));\n    var amplitude = velocityAtTime(key(numKeys).time - 0.001) / omega;\n    if (zeta < 1) {\n      var omegaD = omega * Math.sqrt(1 - zeta * zeta);\n      value + amplitude * Math.exp(-zeta * omega * t) * Math.sin(omegaD * t);\n    } else {\n      value;\n    }\n  } else {\n    value;\n  }\n} else {\n  value;\n}',
    description: 'Spring physics simulation',
    params: {
      mass: { type: 'number', default: 1, description: 'Mass' },
      stiffness: { type: 'number', default: 100, description: 'Spring stiffness' },
      damping: { type: 'number', default: 10, description: 'Damping coefficient' }
    }
  }
};

/**
 * Process expression template with parameters
 */
function processExpressionTemplate(
  templateName: string,
  params?: Record<string, any>
): string {
  const template = EXPRESSION_TEMPLATES[templateName];
  if (!template) {
    throw new Error('Unknown expression template: ' + templateName);
  }

  let expression = template.expression;

  // Replace parameters with values or defaults
  if (template.params) {
    for (const paramName in template.params) {
      const paramDef = template.params[paramName];
      const value = params && params[paramName] !== undefined
        ? params[paramName]
        : paramDef.default;
      const placeholder = '{{' + paramName + '}}';
      expression = expression.split(placeholder).join(String(value));
    }
  }

  return expression;
}

/**
 * Generate script to set an expression on a property
 */
export function generateSetExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  expression: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expression = "' + escapeString(params.expression) + '";\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"',
    expressionEnabled: 'prop.expressionEnabled'
  });

  return wrapInUndoGroup(script, 'Set Expression');
}

/**
 * Generate script to get expression from a property
 */
export function generateGetExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  // NOTE: a bare "{...};" at statement position is parsed by ExtendScript as a
  // BLOCK (labels + SyntaxError), not an object literal. Assign to a var instead.
  script += 'var result = {};\n';
  script += 'result.property = "' + escapeString(params.property) + '";\n';
  script += 'result.expression = prop.expression;\n';
  script += 'result.expressionEnabled = prop.expressionEnabled;\n';
  script += 'result.expressionError = prop.expressionError || null;\n';
  script += 'result;\n';

  return script;
}

/**
 * Generate script to remove expression from a property
 */
export function generateRemoveExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expression = "";\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"'
  });

  return wrapInUndoGroup(script, 'Remove Expression');
}

/**
 * Generate script to enable/disable expression
 */
export function generateEnableExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  enabled: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expressionEnabled = ' + params.enabled + ';\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"',
    expressionEnabled: 'prop.expressionEnabled'
  });

  return wrapInUndoGroup(script, params.enabled ? 'Enable Expression' : 'Disable Expression');
}

/**
 * Generate script to add an expression control to a layer
 */
export function generateAddExpressionControl(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  controlType: string;
  controlName: string;
  defaultValue?: number | number[] | boolean | string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  // Map control types to effect match names
  const controlEffects: Record<string, string> = {
    slider: 'ADBE Slider Control',
    color: 'ADBE Color Control',
    point: 'ADBE Point Control',
    checkbox: 'ADBE Checkbox Control',
    dropdown: 'ADBE Dropdown Control',
    angle: 'ADBE Angle Control',
    layer: 'ADBE Layer Control'
  };

  const effectName = controlEffects[params.controlType];
  if (!effectName) {
    script += 'throw new Error("Unknown control type: ' + escapeString(params.controlType) + '");\n';
    return script;
  }

  script += 'var effect = layer.property("Effects").addProperty("' + effectName + '");\n';
  script += 'effect.name = "' + escapeString(params.controlName) + '";\n';

  // Set default value based on control type
  if (params.defaultValue !== undefined) {
    const propNameMap: Record<string, string> = {
      slider: 'Slider',
      color: 'Color',
      point: 'Point',
      checkbox: 'Checkbox',
      angle: 'Angle',
      layer: 'Layer'
    };
    const propName = propNameMap[params.controlType];
    if (propName && params.controlType !== 'dropdown') {
      if (Array.isArray(params.defaultValue)) {
        script += 'effect.property("' + propName + '").setValue([' + params.defaultValue.join(', ') + ']);\n';
      } else if (typeof params.defaultValue === 'boolean') {
        script += 'effect.property("' + propName + '").setValue(' + (params.defaultValue ? 1 : 0) + ');\n';
      } else {
        script += 'effect.property("' + propName + '").setValue(' + params.defaultValue + ');\n';
      }
    }
  }

  script += generateResultObject({
    success: 'true',
    controlName: '"' + escapeString(params.controlName) + '"',
    controlType: '"' + escapeString(params.controlType) + '"',
    effectIndex: 'effect.propertyIndex'
  });

  return wrapInUndoGroup(script, 'Add Expression Control');
}

/**
 * Generate script to apply an expression template
 */
export function generateApplyExpressionTemplate(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  template: string;
  params?: Record<string, any>;
}): string {
  const expression = processExpressionTemplate(params.template, params.params);

  return generateSetExpression({
    compId: params.compId,
    compName: params.compName,
    layerIndex: params.layerIndex,
    layerName: params.layerName,
    property: params.property,
    expression: expression
  });
}

/**
 * Generate script to link properties with expression
 */
export function generateLinkProperties(params: {
  compId?: number;
  compName?: string;
  sourceLayerIndex?: number;
  sourceLayerName?: string;
  sourceProperty: string;
  targetLayerIndex?: number;
  targetLayerName?: string;
  targetProperty: string;
  offset?: number | number[];
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  // Build expression to link properties
  let targetLayerRef: string;
  if (params.targetLayerIndex) {
    targetLayerRef = 'thisComp.layer(' + params.targetLayerIndex + ')';
  } else if (params.targetLayerName) {
    targetLayerRef = 'thisComp.layer("' + escapeString(params.targetLayerName) + '")';
  } else {
    script += 'throw new Error("Target layer must be specified");\n';
    return script;
  }

  let expression = targetLayerRef + '.property("' + escapeString(params.targetProperty) + '").value';

  if (params.offset !== undefined) {
    if (Array.isArray(params.offset)) {
      expression += ' + [' + params.offset.join(', ') + ']';
    } else {
      expression += ' + ' + params.offset;
    }
  }

  // Set the expression on source property
  script += generateLayerAccess('comp', params.sourceLayerIndex, params.sourceLayerName);
  script += generatePropertyAccess('layer', params.sourceProperty);

  script += 'prop.expression = "' + escapeString(expression) + '";\n';

  script += generateResultObject({
    success: 'true',
    sourceProperty: '"' + escapeString(params.sourceProperty) + '"',
    linkedTo: '"' + escapeString(params.targetProperty) + '"'
  });

  return wrapInUndoGroup(script, 'Link Properties');
}

/**
 * Generate script to batch set expressions on multiple properties
 */
export function generateBatchSetExpressions(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  expressions: Array<{ property: string; expression: string }>;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var results = [];\n';

  for (let i = 0; i < params.expressions.length; i++) {
    const expr = params.expressions[i];
    script += '// Expression ' + (i + 1) + '\n';
    script += 'try {\n';
    script += '  var prop' + i + ' = layer;\n';

    // Navigate to property
    const path = expr.property.split('/');
    for (let j = 0; j < path.length; j++) {
      script += '  prop' + i + ' = prop' + i + '.property("' + escapeString(path[j]) + '");\n';
    }

    script += '  prop' + i + '.expression = "' + escapeString(expr.expression) + '";\n';
    script += '  results.push({ property: "' + escapeString(expr.property) + '", success: true });\n';
    script += '} catch (e) {\n';
    script += '  results.push({ property: "' + escapeString(expr.property) + '", success: false, error: e.toString() });\n';
    script += '}\n';
  }

  script += 'results;\n';

  return wrapInUndoGroup(script, 'Batch Set Expressions');
}

/**
 * Get available expression templates
 */
export function getExpressionTemplates(): Record<string, { description: string; params?: Record<string, any> }> {
  const templates: Record<string, { description: string; params?: Record<string, any> }> = {};
  for (const name in EXPRESSION_TEMPLATES) {
    templates[name] = {
      description: EXPRESSION_TEMPLATES[name].description,
      params: EXPRESSION_TEMPLATES[name].params
    };
  }
  return templates;
}
