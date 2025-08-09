// Global state
let parsedApiData = null;
let selectedFields = new Set();
let generatedCode = {};

// DOM elements
const apiDocsTextarea = document.getElementById('api-docs');
const parseDocsBtn = document.getElementById('parse-docs-btn');
const parseStatus = document.getElementById('parse-status');
const fieldsContainer = document.getElementById('fields-container');
const nodeNameInput = document.getElementById('node-name');
const nodeCategoryInput = document.getElementById('node-category');
const apiKeyHandlingSelect = document.getElementById('api-key-handling');
const generateNodeBtn = document.getElementById('generate-node-btn');
const nodePreviewContainer = document.getElementById('node-preview-container');
const codeContent = document.getElementById('code-content');
const downloadZipBtn = document.getElementById('download-zip-btn');
const individualFilesSection = document.getElementById('individual-files-section');
const fileList = document.getElementById('file-list');
const installationInstructions = document.getElementById('installation-instructions');
const selectAllBtn = document.getElementById('select-all-btn');
const selectNoneBtn = document.getElementById('select-none-btn');

// API Documentation Parser
class ApiDocumentationParser {
    constructor() {
        this.schema = null;
        this.endpoints = [];
        this.parameters = {};
    }

    // Parse markdown or JSON documentation
    parseDocumentation(content) {
        try {
            // Try JSON first
            const jsonData = JSON.parse(content);
            return this.parseJsonSchema(jsonData);
        } catch (e) {
            // Fall back to markdown parsing
            return this.parseMarkdownSchema(content);
        }
    }

    // Parse JSON schema (OpenAPI, JSONSchema, etc.)
    parseJsonSchema(data) {
        const result = {
            modelName: '',
            endpoint: '',
            parameters: {},
            outputType: 'IMAGE'
        };

        // Extract model name and endpoint
        if (data.info && data.info.title) {
            result.modelName = data.info.title.replace(/[^a-zA-Z0-9]/g, '_');
        }

        if (data.paths) {
            const firstPath = Object.keys(data.paths)[0];
            result.endpoint = firstPath;
            
            const pathData = data.paths[firstPath];
            const method = Object.keys(pathData).find(m => ['post', 'put', 'patch'].includes(m));
            
            if (method && pathData[method].requestBody) {
                const schema = pathData[method].requestBody.content['application/json']?.schema;
                if (schema) {
                    result.parameters = this.extractParameters(schema);
                }
            }
        }

        // Try to determine output type from responses
        if (data.paths) {
            const responses = Object.values(data.paths)[0]?.post?.responses?.['200'];
            if (responses) {
                result.outputType = this.inferOutputType(responses);
            }
        }

        return result;
    }

    // Parse markdown documentation
    parseMarkdownSchema(markdown) {
        const result = {
            modelName: '',
            endpoint: '',
            parameters: {},
            outputType: 'IMAGE'
        };

        // Extract model name from title
        const titleMatch = markdown.match(/^#\s+(.+)/m);
        if (titleMatch) {
            result.modelName = titleMatch[1].replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        }

        // Extract endpoint from Fal.ai format - prefer Model ID over full URL
        const modelIdMatch = markdown.match(/\*\*Model ID\*\*:\s*`([^`]+)`/i) ||
                            markdown.match(/- \*\*Model ID\*\*:\s*`([^`]+)`/i);
        
        const endpointMatch = markdown.match(/\*\*Endpoint\*\*:\s*`([^`]+)`/i) ||
                              markdown.match(/- \*\*Endpoint\*\*:\s*`([^`]+)`/i);
        
        if (modelIdMatch) {
            // Use Model ID (preferred format for fal_client)
            result.endpoint = modelIdMatch[1];
            console.log('Using Model ID as endpoint:', result.endpoint);
        } else if (endpointMatch) {
            // Extract model ID from full URL if no Model ID field found
            const fullUrl = endpointMatch[1];
            if (fullUrl.includes('fal.run/')) {
                result.endpoint = fullUrl.split('fal.run/')[1];
                console.log('Extracted endpoint from URL:', result.endpoint);
            } else {
                result.endpoint = fullUrl;
            }
        }

        // Parse parameter definitions
        result.parameters = this.parseMarkdownParameters(markdown);

        // Infer output type
        if (markdown.toLowerCase().includes('video') || markdown.toLowerCase().includes('mp4')) {
            result.outputType = 'VIDEO';
        } else if (markdown.toLowerCase().includes('audio') || markdown.toLowerCase().includes('wav')) {
            result.outputType = 'AUDIO';
        }

        return result;
    }

    // Extract parameters from JSON schema
    extractParameters(schema) {
        const parameters = {};

        if (schema.properties) {
            for (const [name, prop] of Object.entries(schema.properties)) {
                parameters[name] = this.convertJsonProperty(prop, schema.required?.includes(name) || false);
            }
        }

        return parameters;
    }

    // Convert JSON schema property to our parameter format
    convertJsonProperty(prop, required = false) {
        const param = {
            type: this.mapJsonTypeToComfyType(prop.type, prop),
            required: required,
            description: prop.description || '',
            default: prop.default
        };

        // Handle enums
        if (prop.enum) {
            param.enum = prop.enum;
            param.type = 'ENUM';
        }

        // Handle ranges for numbers
        if (prop.type === 'number' || prop.type === 'integer') {
            param.min = prop.minimum;
            param.max = prop.maximum;
        }

        return param;
    }

    // Parse parameters from markdown (Fal.ai format)
    parseMarkdownParameters(markdown) {
        const parameters = {};
        
        // Look for Input Schema section specifically
        const inputSchemaMatch = markdown.match(/### Input Schema\s*([\s\S]*?)(?=###|##|$)/i);
        if (!inputSchemaMatch) {
            console.log('No Input Schema section found');
            return parameters;
        }

        const inputText = inputSchemaMatch[1];
        
        // Split by parameter entries - look for lines starting with "- **`parameter_name`**"
        const paramBlocks = inputText.split(/(?=^- \*\*`[^`]+`\*\*)/gm)
            .filter(block => block.trim() && /\*\*`[^`]+`\*\*/.test(block));

        console.log('Found parameter blocks:', paramBlocks.length);

        for (const block of paramBlocks) {
            const param = this.parseFalAiParameterBlock(block.trim());
            console.log('Processing parameter:', param.name, 'type:', param.type, 'skip:', param.skip);
            
            if (param.name && !param.skip) {
                console.log('Adding parameter:', param.name, param.type);
                parameters[param.name] = param;
            } else if (param.name && (param.skip || param.name === 'image_size')) {
                // Split ImageSize into separate width and height fields
                console.log('Converting ImageSize to width/height fields for:', param.name);
                
                parameters['width'] = {
                    name: 'width',
                    type: 'INT',
                    required: param.required,
                    description: 'Image width in pixels',
                    default: 1024,
                    min: 256,
                    max: 2048
                };
                
                parameters['height'] = {
                    name: 'height', 
                    type: 'INT',
                    required: param.required,
                    description: 'Image height in pixels',
                    default: 1024,
                    min: 256,
                    max: 2048
                };
                
                console.log('Added width and height fields');
            }
        }

        return parameters;
    }

    // Parse individual Fal.ai parameter block
    parseFalAiParameterBlock(block) {
        const param = {
            name: '',
            type: 'STRING',
            required: false,
            description: '',
            default: null,
            enum: null,
            min: null,
            max: null
        };

        // Extract parameter name from "- **`parameter_name`**"
        const nameMatch = block.match(/- \*\*`([^`]+)`\*\*/);
        if (!nameMatch) return param;
        
        param.name = nameMatch[1];

        // Extract type and required status from the same line
        // Format: "- **`param`** (`type`, _required_|_optional_):"
        const typeRequiredMatch = block.match(/\*\*`[^`]+`\*\*\s*\(`([^`]+)`,\s*_([^_]+)_\)/);
        if (typeRequiredMatch) {
            const typeStr = typeRequiredMatch[1].toLowerCase().trim();
            param.required = typeRequiredMatch[2] === 'required';
            
            // Map Fal.ai types to ComfyUI types
            if (typeStr === 'string') {
                param.type = 'STRING';
            } else if (typeStr === 'integer') {
                param.type = 'INT';
            } else if (typeStr === 'float') {
                param.type = 'FLOAT';
            } else if (typeStr === 'boolean') {
                param.type = 'BOOLEAN';
            } else if (typeStr.includes('imagesize') || typeStr.includes('ImageSize')) {
                // Special handling for ImageSize - mark for splitting
                param.type = 'IMAGESIZE';
                console.log('Detected ImageSize type for:', param.name);
            } else if (typeStr.includes('enum') || typeStr.includes('|')) {
                param.type = 'ENUM';
            } else if (typeStr.includes('list') || typeStr.includes('array')) {
                param.type = 'ARRAY';
            } else {
                param.type = 'STRING'; // fallback
            }
        }

        // Extract description (first line after the parameter definition)
        const lines = block.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('-') && !line.startsWith('*') && !line.startsWith('Default:') && !line.startsWith('Range:') && !line.startsWith('Options:')) {
                param.description = line;
                break;
            }
        }

        // Extract default value - look for "Default: `value`" or "Default value: `value`"
        const defaultMatch = block.match(/Default(?:\s+value)?:\s*`([^`]*)`/i);
        if (defaultMatch) {
            const defaultStr = defaultMatch[1];
            
            if (param.type === 'BOOLEAN') {
                param.default = defaultStr === 'true';
            } else if (param.type === 'INT') {
                param.default = parseInt(defaultStr) || null;
            } else if (param.type === 'FLOAT') {
                param.default = parseFloat(defaultStr) || null;
            } else if (defaultStr === '""' || defaultStr === '') {
                param.default = '';
            } else if (defaultStr === '[]') {
                param.default = [];
            } else if (defaultStr.startsWith('{') && defaultStr.endsWith('}')) {
                // Handle object defaults like {"height":1024,"width":1024}
                try {
                    param.default = JSON.parse(defaultStr);
                } catch {
                    param.default = defaultStr;
                }
            } else {
                param.default = defaultStr;
            }
        }

        // Extract range - look for "Range: `min` to `max`"
        const rangeMatch = block.match(/Range:\s*`(\d+(?:\.\d+)?)`\s*to\s*`(\d+(?:\.\d+)?)`/i);
        if (rangeMatch && (param.type === 'INT' || param.type === 'FLOAT')) {
            param.min = parseFloat(rangeMatch[1]);
            param.max = parseFloat(rangeMatch[2]);
        }

        // Extract enum options - look for "Options: `option1`, `option2`"
        const optionsMatch = block.match(/Options:\s*(.+)/i);
        if (optionsMatch) {
            const optionsStr = optionsMatch[1];
            const options = optionsStr.match(/`([^`]+)`/g);
            if (options) {
                param.enum = options.map(opt => opt.replace(/`/g, ''));
                param.type = 'ENUM';
            }
        }

        // Handle special ImageSize type - split into width and height
        if (param.type === 'IMAGESIZE' || param.name === 'image_size') {
            // Don't return the ImageSize param itself, we'll handle this specially
            param.type = 'IMAGESIZE';
            param.skip = true;
            console.log('Marking image_size parameter for splitting');
        }

        return param;
    }

    // Parse individual parameter block from markdown
    parseParameterBlock(block) {
        const param = {
            name: '',
            type: 'STRING',
            required: false,
            description: '',
            default: null,
            enum: null,
            min: null,
            max: null
        };

        // Extract parameter name - handle various markdown formats
        const nameMatch = block.match(/(?:^-\s*|^\*\s*|^\d+\.\s*)?`([^`]+)`/m) || 
                         block.match(/(?:^-\s*|^\*\s*|^\d+\.\s*)([a-zA-Z_][a-zA-Z0-9_]*)/m);
        if (nameMatch) {
            param.name = nameMatch[1];
        }

        if (!param.name) return param; // Skip if no name found

        // Check if required/optional - look for explicit markers
        if (/\(.*required.*\)/i.test(block) || /,\s*required\b/i.test(block)) {
            param.required = true;
        } else if (/\(.*optional.*\)/i.test(block) || /,\s*optional\b/i.test(block)) {
            param.required = false;
        }

        // Extract type from parentheses or inline
        const typeMatch = block.match(/\(\s*([^,)]+)/i);
        if (typeMatch) {
            const typeStr = typeMatch[1].toLowerCase().trim();
            param.type = this.mapTypeToComfyType(typeStr);
        }

        // Extract full description - everything after the colon or name
        const descMatch = block.match(/(?:`[^`]+`[^:]*:|[a-zA-Z_][a-zA-Z0-9_]*[^:]*:)\s*([^.\n]+(?:\.[^.\n]*)*)/);
        if (descMatch) {
            param.description = descMatch[1].trim();
        }

        // Extract enum values - look for various formats
        const enumPatterns = [
            /Options?:\s*\[([^\]]+)\]/i,
            /Choices?:\s*\[([^\]]+)\]/i, 
            /Values?:\s*\[([^\]]+)\]/i,
            /\[([^\]]*"[^"]*"[^\]]*)\]/g // Look for quoted values in brackets
        ];

        for (const pattern of enumPatterns) {
            const enumMatch = block.match(pattern);
            if (enumMatch) {
                param.enum = enumMatch[1]
                    .split(',')
                    .map(v => v.trim().replace(/^["']|["']$/g, ''))
                    .filter(v => v.length > 0);
                if (param.enum.length > 0) {
                    param.type = 'ENUM';
                    break;
                }
            }
        }

        // Extract numeric ranges
        const rangePatterns = [
            /Range:\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/i,
            /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/,
            /Min(?:imum)?:\s*(\d+(?:\.\d+)?)/i,
            /Max(?:imum)?:\s*(\d+(?:\.\d+)?)/i
        ];

        for (const pattern of rangePatterns) {
            const rangeMatch = block.match(pattern);
            if (rangeMatch && (param.type === 'INT' || param.type === 'FLOAT')) {
                if (rangeMatch[2]) {
                    param.min = parseFloat(rangeMatch[1]);
                    param.max = parseFloat(rangeMatch[2]);
                } else {
                    // Single value - might be min or max
                    if (pattern.source.includes('Min')) {
                        param.min = parseFloat(rangeMatch[1]);
                    } else if (pattern.source.includes('Max')) {
                        param.max = parseFloat(rangeMatch[1]);
                    }
                }
                break;
            }
        }

        // Extract default values
        const defaultPatterns = [
            /Default:\s*([^.\n,]+)/i,
            /default:\s*([^.\n,]+)/i,
            /\bdefault\s+([^.\n,]+)/i
        ];

        for (const pattern of defaultPatterns) {
            const defaultMatch = block.match(pattern);
            if (defaultMatch) {
                let defaultVal = defaultMatch[1].trim().replace(/^["']|["']$/g, '');
                
                // Convert string representations to appropriate types
                if (param.type === 'BOOLEAN') {
                    param.default = defaultVal.toLowerCase() === 'true';
                } else if (param.type === 'INT') {
                    param.default = parseInt(defaultVal);
                } else if (param.type === 'FLOAT') {
                    param.default = parseFloat(defaultVal);
                } else {
                    param.default = defaultVal;
                }
                break;
            }
        }

        return param;
    }

    // Map JSON types to ComfyUI types
    mapJsonTypeToComfyType(jsonType, prop) {
        const typeMap = {
            'string': 'STRING',
            'integer': 'INT',
            'number': 'FLOAT',
            'boolean': 'BOOLEAN',
            'array': 'ARRAY',
            'object': 'OBJECT'
        };

        return typeMap[jsonType] || 'STRING';
    }

    // Map general types to ComfyUI types
    mapTypeToComfyType(type) {
        const typeMap = {
            'string': 'STRING',
            'int': 'INT',
            'integer': 'INT',
            'float': 'FLOAT',
            'number': 'FLOAT',
            'bool': 'BOOLEAN',
            'boolean': 'BOOLEAN',
            'array': 'ARRAY',
            'object': 'OBJECT'
        };

        return typeMap[type] || 'STRING';
    }

    // Infer output type from response schema
    inferOutputType(responses) {
        const responseStr = JSON.stringify(responses).toLowerCase();
        
        if (responseStr.includes('video') || responseStr.includes('mp4')) {
            return 'VIDEO';
        } else if (responseStr.includes('audio') || responseStr.includes('wav') || responseStr.includes('mp3')) {
            return 'AUDIO';
        } else if (responseStr.includes('image') || responseStr.includes('png') || responseStr.includes('jpg')) {
            return 'IMAGE';
        }
        
        return 'IMAGE'; // Default
    }
}

// ComfyUI Code Generator
class ComfyUICodeGenerator {
    constructor(apiData, selectedFields, config) {
        this.apiData = apiData;
        this.selectedFields = selectedFields;
        this.config = config;
    }

    generateMainNodeFile() {
        const className = this.toPascalCase(this.config.nodeName);
        const imports = this.generateImports();
        const inputTypes = this.generateInputTypes();
        const executeFunction = this.generateExecuteFunction();
        
        return `${imports}

class ${className}:
    """
    ComfyUI node for ${this.config.nodeName}
    Generated by Fal.ai to ComfyUI Node Generator
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
${inputTypes.required}
            },
            "optional": {
${inputTypes.optional}
            }
        }
    
    RETURN_TYPES = ("${this.getOutputType()}",)
    RETURN_NAMES = ("${this.getOutputName()}",)
    FUNCTION = "execute"
    CATEGORY = "${this.config.nodeCategory}"
    OUTPUT_NODE = False

    def __init__(self):
        print(f"Initializing ${this.config.nodeName} node...")
        self.client = fal_client

${executeFunction}

${this.generateHelperFunctions()}

# Register the node
NODE_CLASS_MAPPINGS = {
    "${className}": ${className}
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "${className}": "${this.config.nodeName}"
}

print(f"Registered ComfyUI node: ${this.config.nodeName}")
print(f"Node class: ${className}")
print(f"Node category: ${this.config.nodeCategory}")`;
    }

    generateImports() {
        let imports = `# ComfyUI Node for ${this.config.nodeName}
# Generated by Fal.ai to ComfyUI Node Generator

try:
    import fal_client
except ImportError:
    raise ImportError("fal-client not installed. Please install with: pip install fal-client")

try:
    import torch
    import numpy as np
    from PIL import Image
    import requests
    from io import BytesIO
    import tempfile
    import os
except ImportError as e:
    print(f"Missing required dependency: {e}")
    print("Please install requirements with: pip install -r requirements.txt")
    raise`;

        if (this.apiData.outputType === 'VIDEO') {
            imports += `

try:
    import cv2
except ImportError:
    print("OpenCV not installed. Video processing will not work.")
    print("Install with: pip install opencv-python")
    cv2 = None`;
        }
        
        if (this.apiData.outputType === 'AUDIO') {
            imports += `

try:
    import librosa
    import soundfile as sf
except ImportError:
    print("Audio libraries not installed. Audio processing will not work.")
    print("Install with: pip install librosa soundfile")
    librosa = None
    sf = None`;
        }

        if (this.config.apiKeyHandling === 'config') {
            imports += `
import configparser`;
        }

        return imports;
    }

    generateInputTypes() {
        const required = [];
        const optional = [];

        // Add API key handling
        if (this.config.apiKeyHandling === 'input') {
            required.push('                "api_key": ("STRING", {"default": ""})');
        }

        // Process selected fields
        for (const fieldName of this.selectedFields) {
            const field = this.apiData.parameters[fieldName];
            if (!field) continue;

            const inputDef = this.generateFieldInput(fieldName, field);
            
            if (field.required) {
                required.push(`                "${fieldName}": ${inputDef}`);
            } else {
                optional.push(`                "${fieldName}": ${inputDef}`);
            }
        }

        return {
            required: required.join(',\n'),
            optional: optional.join(',\n')
        };
    }

    generateFieldInput(fieldName, field) {
        switch (field.type) {
            case 'ENUM':
                let defaultValue = field.default;
                if (typeof defaultValue === 'object') {
                    defaultValue = JSON.stringify(defaultValue);
                } else if (!defaultValue && field.enum && field.enum.length > 0) {
                    defaultValue = field.enum[0];
                }
                
                // Properly escape the default value for Python strings
                const escapedDefault = (defaultValue || '').replace(/"/g, '\\"');
                
                // Generate enum list - ensure field.enum exists
                const enumList = field.enum ? JSON.stringify(field.enum) : '[]';
                
                return `(${enumList}, {"default": "${escapedDefault}"})`;
                
            case 'INT':
                const intDefault = field.default !== null && field.default !== undefined ? field.default : (field.min !== null && field.min !== undefined ? field.min : 1);
                const minVal = field.min !== null && field.min !== undefined ? field.min : 1;
                const maxVal = field.max !== null && field.max !== undefined ? field.max : 100;
                return `("INT", {"default": ${intDefault}, "min": ${minVal}, "max": ${maxVal}})`;
                
            case 'FLOAT':
                const floatDefault = field.default !== null && field.default !== undefined ? field.default : (field.min !== null && field.min !== undefined ? field.min : 1.0);
                const minFloat = field.min !== null && field.min !== undefined ? field.min : 0.0;
                const maxFloat = field.max !== null && field.max !== undefined ? field.max : 10.0;
                return `("FLOAT", {"default": ${floatDefault}, "min": ${minFloat}, "max": ${maxFloat}})`;
                
            case 'BOOLEAN':
                const boolDefault = field.default === true || field.default === 'true';
                // Use Python boolean literals
                return `("BOOLEAN", {"default": ${boolDefault ? 'True' : 'False'}})`;
                
            case 'ARRAY':
                return `("STRING", {"default": "[]", "multiline": True})`;
                
            default:
                const stringDefault = field.default !== null && field.default !== undefined ? field.default : '';
                const escapedStringDefault = stringDefault.toString().replace(/"/g, '\\"');
                return `("STRING", {"default": "${escapedStringDefault}"})`;
        }
    }

    generateExecuteFunction() {
        const params = Array.from(this.selectedFields);
        if (this.config.apiKeyHandling === 'input') {
            params.unshift('api_key');
        }

        const paramList = params.join(', ');
        const apiKeySetup = this.generateApiKeySetup();
        const requestPayload = this.generateRequestPayload();
        const outputProcessing = this.generateOutputProcessing();

        return `    def execute(self, ${paramList}):
        try:
${apiKeySetup}
            
            # Prepare request payload
            payload = {
${requestPayload}
            }
            
            # Process payload values and remove empty/None values
            import json
            processed_payload = {}
            
            for k, v in payload.items():
                if v is not None and v != "":
                    # Handle array/list parameters
                    if k in ["loras"] and isinstance(v, str):
                        try:
                            processed_payload[k] = json.loads(v) if v.strip() != "[]" else []
                        except:
                            processed_payload[k] = []
                    # Handle image_size object
                    elif k == "image_size" and isinstance(v, dict):
                        processed_payload[k] = v
                    # Handle other parameters - remove extra quotes from enum values
                    else:
                        # If it's a string that looks like it has extra quotes, clean it
                        if isinstance(v, str) and v.startswith('"') and v.endswith('"'):
                            processed_payload[k] = v[1:-1]  # Remove outer quotes
                        else:
                            processed_payload[k] = v
            
            payload = processed_payload
            
            # Make API request
            result = fal_client.run(
                "${this.apiData.endpoint}",
                arguments=payload
            )
            
${outputProcessing}
            
        except Exception as e:
            print(f"Error in ${this.toPascalCase(this.config.nodeName)}: {str(e)}")
            raise e`;
    }

    generateApiKeySetup() {
        switch (this.config.apiKeyHandling) {
            case 'input':
                return `            # Set API key from input
            if api_key:
                os.environ["FAL_KEY"] = api_key`;
                
            case 'config':
                return `            # Load API key from config file
            config = configparser.ConfigParser()
            config_path = os.path.join(os.path.dirname(__file__), 'config.ini')
            if os.path.exists(config_path):
                config.read(config_path)
                if 'fal' in config and 'api_key' in config['fal']:
                    os.environ["FAL_KEY"] = config['fal']['api_key']`;
                    
            case 'embedded':
                return `            # API key should be set in environment variables
            # Set your FAL_KEY environment variable`;
                
            default:
                return '';
        }
    }

    generateRequestPayload() {
        const payloadItems = [];
        
        // Check if both width and height are selected
        const hasWidth = this.selectedFields.has('width');
        const hasHeight = this.selectedFields.has('height');
        
        for (const fieldName of this.selectedFields) {
            // Skip width and height - we'll handle them specially
            if (fieldName === 'width' || fieldName === 'height') {
                continue;
            }
            payloadItems.push(`                "${fieldName}": ${fieldName}`);
        }
        
        // Add image_size object if width and height are present
        if (hasWidth && hasHeight) {
            payloadItems.push(`                "image_size": {"width": width, "height": height}`);
        } else if (hasWidth) {
            payloadItems.push(`                "image_size": {"width": width, "height": 1024}`);
        } else if (hasHeight) {
            payloadItems.push(`                "image_size": {"width": 1024, "height": height}`);
        }
        
        return payloadItems.join(',\n');
    }

    generateOutputProcessing() {
        switch (this.apiData.outputType) {
            case 'VIDEO':
                return `            # Process video output
            if 'video' in result:
                video_url = result['video']['url']
                return (self._process_video_output(video_url),)
            else:
                raise Exception("No video found in API response")`;
                
            case 'AUDIO':
                return `            # Process audio output
            if 'audio' in result:
                audio_url = result['audio']['url']
                return (self._process_audio_output(audio_url),)
            else:
                raise Exception("No audio found in API response")`;
                
            default: // IMAGE
                return `            # Process image output
            if 'images' in result and len(result['images']) > 0:
                image_url = result['images'][0]['url']
                return (self._process_image_output(image_url),)
            elif 'image' in result:
                image_url = result['image']['url']
                return (self._process_image_output(image_url),)
            else:
                raise Exception("No image found in API response")`;
        }
    }

    generateHelperFunctions() {
        let helpers = `    def _process_image_output(self, image_url):
        """Convert API image to ComfyUI IMAGE format"""
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            
            # Load image
            image = Image.open(BytesIO(response.content))
            
            # Convert to RGB
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Convert to numpy array (H, W, C) with values 0-1
            image_np = np.array(image).astype(np.float32) / 255.0
            
            # Convert to torch tensor (1, H, W, C)
            image_tensor = torch.from_numpy(image_np).unsqueeze(0)
            
            return image_tensor
            
        except Exception as e:
            print(f"Error processing image: {str(e)}")
            raise e`;

        if (this.apiData.outputType === 'VIDEO') {
            helpers += `
    
    def _process_video_output(self, video_url):
        """Convert API video to ComfyUI VIDEO format"""
        try:
            # Download video to temp file
            response = requests.get(video_url, timeout=60)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name
            
            # Extract frames using OpenCV
            cap = cv2.VideoCapture(temp_path)
            frames = []
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                    
                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                # Normalize to 0-1
                frame_normalized = frame_rgb.astype(np.float32) / 255.0
                frames.append(frame_normalized)
            
            cap.release()
            os.unlink(temp_path)  # Clean up temp file
            
            if not frames:
                raise Exception("No frames extracted from video")
            
            # Convert to tensor (1, F, H, W, C)
            video_tensor = torch.from_numpy(np.stack(frames)).unsqueeze(0)
            
            return video_tensor
            
        except Exception as e:
            print(f"Error processing video: {str(e)}")
            raise e`;
        }

        if (this.apiData.outputType === 'AUDIO') {
            helpers += `
    
    def _process_audio_output(self, audio_url):
        """Convert API audio to ComfyUI AUDIO format"""
        try:
            # Download audio to temp file
            response = requests.get(audio_url, timeout=60)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name
            
            # Load audio using librosa
            audio_data, sample_rate = librosa.load(temp_path, sr=None, mono=False)
            
            os.unlink(temp_path)  # Clean up temp file
            
            # Convert to tensor format expected by ComfyUI
            if audio_data.ndim == 1:
                audio_data = audio_data[np.newaxis, :]  # Add channel dimension
            
            audio_tensor = torch.from_numpy(audio_data)
            
            return audio_tensor
            
        except Exception as e:
            print(f"Error processing audio: {str(e)}")
            raise e`;
        }

        return helpers;
    }

    generateInitFile() {
        const className = this.toPascalCase(this.config.nodeName);
        const fileName = this.toSnakeCase(this.config.nodeName);
        return `# ComfyUI Node Package Init
from .${fileName} import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Export the mappings so ComfyUI can find them
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

print("Loading ${this.config.nodeName} node package...")`;
    }

    generateRequirementsFile() {
        let requirements = `fal-client
torch
numpy
Pillow
requests`;

        if (this.apiData.outputType === 'VIDEO') {
            requirements += `\nopencv-python`;
        }
        
        if (this.apiData.outputType === 'AUDIO') {
            requirements += `\nlibrosa\nsoundfile`;
        }

        return requirements;
    }

    generateConfigFile() {
        if (this.config.apiKeyHandling !== 'config') {
            return null;
        }

        return `[fal]
# Replace 'your_api_key_here' with your actual Fal.ai API key
api_key = your_api_key_here`;
    }

    generateInstallerScript() {
        const folderName = this.toSnakeCase(this.config.nodeName);
        
        return `#!/usr/bin/env python3
"""
Auto-installer for ${this.config.nodeName} ComfyUI Node
"""
import os
import sys
import subprocess
import shutil
import platform

def find_comfyui_directory():
    """Try to find ComfyUI installation directory"""
    possible_paths = [
        os.path.expanduser("~/ComfyUI"),
        os.path.expanduser("~/Desktop/ComfyUI"),
        os.path.expanduser("~/Documents/ComfyUI"),
        "./ComfyUI",
        "../ComfyUI",
    ]
    
    for path in possible_paths:
        if os.path.exists(os.path.join(path, "main.py")):
            return path
    
    return None

def install_node():
    """Install the node to ComfyUI"""
    print("Installing ${this.config.nodeName} ComfyUI Node...")
    
    # Find ComfyUI directory
    comfyui_dir = find_comfyui_directory()
    if not comfyui_dir:
        print("❌ ComfyUI directory not found!")
        print("Please ensure ComfyUI is installed and try again.")
        comfyui_dir = input("Enter ComfyUI directory path manually: ").strip()
        
        if not os.path.exists(os.path.join(comfyui_dir, "main.py")):
            print("❌ Invalid ComfyUI directory!")
            return False
    
    print(f"✅ Found ComfyUI at: {comfyui_dir}")
    
    # Create custom_nodes directory if it doesn't exist
    custom_nodes_dir = os.path.join(comfyui_dir, "custom_nodes")
    os.makedirs(custom_nodes_dir, exist_ok=True)
    
    # Create node directory
    node_dir = os.path.join(custom_nodes_dir, "${folderName}")
    os.makedirs(node_dir, exist_ok=True)
    
    # Copy files
    current_dir = os.path.dirname(__file__)
    files_to_copy = [
        "${this.toSnakeCase(this.config.nodeName)}.py",
        "__init__.py",
        "requirements.txt"
    ]
    
    ${this.config.apiKeyHandling === 'config' ? 'files_to_copy.append("config.ini")' : ''}
    
    for file in files_to_copy:
        src = os.path.join(current_dir, file)
        dst = os.path.join(node_dir, file)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"✅ Copied {file}")
    
    # Install Python dependencies
    print("Installing Python dependencies...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r",
            os.path.join(node_dir, "requirements.txt")
        ])
        print("✅ Dependencies installed successfully!")
    except subprocess.CalledProcessError:
        print("❌ Failed to install dependencies. Please run manually:")
        print(f"pip install -r {os.path.join(node_dir, 'requirements.txt')}")
    
    print(f"✅ Node installed successfully to: {node_dir}")
    print("🔄 Please restart ComfyUI to load the new node.")
    
    ${this.config.apiKeyHandling === 'config' ? `print("⚠️  Don't forget to edit config.ini and add your Fal.ai API key!")` : ''}
    
    return True

if __name__ == "__main__":
    try:
        if install_node():
            print("\\n🎉 Installation completed successfully!")
        else:
            print("\\n❌ Installation failed!")
    except KeyboardInterrupt:
        print("\\n❌ Installation cancelled by user.")
    except Exception as e:
        print(f"\\n❌ Installation failed with error: {e}")
    
    input("Press Enter to exit...")`;
    }

    generateReadme() {
        const folderName = this.toSnakeCase(this.config.nodeName);
        
        return `# ${this.config.nodeName} ComfyUI Node

ComfyUI custom node for ${this.config.nodeName} generated by Fal.ai to ComfyUI Node Generator.

## Installation

### Option 1: Automatic Installation (Recommended)

1. Download and extract the node package ZIP file
2. Run the installer:
   \`\`\`bash
   python install.py
   \`\`\`
3. Restart ComfyUI

### Option 2: Manual Installation

1. Extract all files to your ComfyUI custom_nodes directory:
   \`\`\`
   ComfyUI/custom_nodes/${folderName}/
   \`\`\`

2. Install Python dependencies:
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

3. ${this.config.apiKeyHandling === 'config' ? 'Edit config.ini and add your Fal.ai API key' : 'Set up your API key (see below)'}

4. Restart ComfyUI

## API Key Setup

${this.generateApiKeyInstructions()}

## Usage

1. Look for "${this.config.nodeName}" in the "${this.config.nodeCategory}" category
2. Connect your inputs to the node
3. Connect the output to a Save Image/Video node
4. Queue the prompt

## Troubleshooting

### Common Issues

- **Node not appearing**: Make sure you restarted ComfyUI after installation
- **API errors**: Check your API key and internet connection
- **Import errors**: Ensure all dependencies are installed correctly

### Getting Help

If you encounter issues:
1. Check the ComfyUI console for error messages
2. Verify your API key is correctly configured
3. Ensure all dependencies are installed

## Generated Files

- \`${this.toSnakeCase(this.config.nodeName)}.py\` - Main node implementation
- \`__init__.py\` - ComfyUI integration
- \`requirements.txt\` - Python dependencies
${this.config.apiKeyHandling === 'config' ? '- `config.ini` - Configuration file for API key' : ''}
- \`install.py\` - Automatic installer script

---

Generated by [Fal.ai to ComfyUI Node Generator](https://github.com/your-repo)`;
    }

    generateApiKeyInstructions() {
        switch (this.config.apiKeyHandling) {
            case 'input':
                return `The API key is provided as a node input. Connect a text primitive with your Fal.ai API key to the "api_key" input.`;
                
            case 'config':
                return `Edit the \`config.ini\` file in the node directory and replace \`your_api_key_here\` with your actual Fal.ai API key.`;
                
            case 'embedded':
                return `Set the \`FAL_KEY\` environment variable with your Fal.ai API key before starting ComfyUI.`;
                
            default:
                return 'Configure your API key according to your selected method.';
        }
    }

    getOutputType() {
        const typeMap = {
            'IMAGE': 'IMAGE',
            'VIDEO': 'VIDEO', 
            'AUDIO': 'AUDIO'
        };
        return typeMap[this.apiData.outputType] || 'IMAGE';
    }

    getOutputName() {
        const nameMap = {
            'IMAGE': 'image',
            'VIDEO': 'video',
            'AUDIO': 'audio'
        };
        return nameMap[this.apiData.outputType] || 'output';
    }

    toPascalCase(str) {
        return str.replace(/(?:^|[-_\s])(\w)/g, (_, char) => char.toUpperCase());
    }

    toSnakeCase(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }
}

// Event Listeners
parseDocsBtn.addEventListener('click', parseDocumentation);
generateNodeBtn.addEventListener('click', generateNode);
downloadZipBtn.addEventListener('click', downloadNodePackage);
selectAllBtn.addEventListener('click', selectAllFields);
selectNoneBtn.addEventListener('click', selectNoneFields);

// Code tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        showCodeTab(e.target.dataset.tab);
    });
});

// Node name input listener for preview updates
nodeNameInput.addEventListener('input', updateNodePreview);
nodeCategoryInput.addEventListener('input', updateNodePreview);
apiKeyHandlingSelect.addEventListener('change', updateNodePreview);

function parseDocumentation() {
    const content = apiDocsTextarea.value.trim();
    
    if (!content) {
        showStatus('Please paste API documentation first.', 'error');
        return;
    }

    showStatus('Parsing documentation...', 'info');
    
    try {
        const parser = new ApiDocumentationParser();
        parsedApiData = parser.parseDocumentation(content);
        
        if (!parsedApiData.parameters || Object.keys(parsedApiData.parameters).length === 0) {
            showStatus('No parameters found in documentation. Please check the format.', 'error');
            return;
        }

        // Set default node name if not set
        if (!nodeNameInput.value && parsedApiData.modelName) {
            nodeNameInput.value = parsedApiData.modelName.replace(/_/g, ' ');
        }

        showStatus(`Successfully parsed ${Object.keys(parsedApiData.parameters).length} parameters.`, 'success');
        displayFields();
        generateNodeBtn.disabled = false;
        
    } catch (error) {
        console.error('Parse error:', error);
        showStatus('Failed to parse documentation. Please check the format.', 'error');
    }
}

function displayFields() {
    if (!parsedApiData || !parsedApiData.parameters) {
        return;
    }

    const fields = Object.entries(parsedApiData.parameters);
    
    if (fields.length === 0) {
        fieldsContainer.innerHTML = '<div class="placeholder-message">No parameters found</div>';
        return;
    }

    const fieldsHtml = fields.map(([name, field]) => `
        <div class="field-item ${field.required ? 'required' : 'optional'}">
            <div class="field-info">
                <div>
                    <span class="field-name">${name}</span>
                    <span class="field-type">${field.type}</span>
                    ${field.required ? '<span class="field-type" style="background: #ff3b30; color: white;">REQUIRED</span>' : ''}
                </div>
                ${field.description ? `<div class="field-description">${field.description}</div>` : ''}
                ${field.enum ? `<div class="field-description"><strong>Options:</strong> ${field.enum.join(', ')}</div>` : ''}
                ${field.min !== null || field.max !== null ? `<div class="field-description"><strong>Range:</strong> ${field.min || 'min'} - ${field.max || 'max'}</div>` : ''}
            </div>
            <div class="field-controls">
                <input type="checkbox" class="field-checkbox" data-field="${name}" ${field.required ? 'checked' : ''}>
            </div>
        </div>
    `).join('');

    fieldsContainer.innerHTML = fieldsHtml;

    // Enable select all/none buttons
    selectAllBtn.disabled = false;
    selectNoneBtn.disabled = false;

    // Add event listeners to checkboxes
    fieldsContainer.querySelectorAll('.field-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const fieldName = e.target.dataset.field;
            if (e.target.checked) {
                selectedFields.add(fieldName);
            } else {
                selectedFields.delete(fieldName);
            }
            updateNodePreview();
        });

        // Initialize selected fields
        if (checkbox.checked) {
            selectedFields.add(checkbox.dataset.field);
        }
    });

    updateNodePreview();
}

function generateNode() {
    if (!parsedApiData || selectedFields.size === 0) {
        showStatus('Please select at least one field.', 'error');
        return;
    }

    const config = {
        nodeName: nodeNameInput.value || 'Fal Model',
        nodeCategory: nodeCategoryInput.value || 'fal_models',
        apiKeyHandling: apiKeyHandlingSelect.value
    };

    try {
        const generator = new ComfyUICodeGenerator(parsedApiData, selectedFields, config);
        
        generatedCode = {
            main: generator.generateMainNodeFile(),
            init: generator.generateInitFile(),
            requirements: generator.generateRequirementsFile(),
            installer: generator.generateInstallerScript(),
            readme: generator.generateReadme()
        };

        const configFile = generator.generateConfigFile();
        if (configFile) {
            generatedCode.config = configFile;
        }

        showCodeTab('main');
        downloadZipBtn.disabled = false;
        showIndividualFiles();
        showInstallationInstructions();
        
        showStatus('Node generated successfully!', 'success');
        
    } catch (error) {
        console.error('Generation error:', error);
        showStatus('Failed to generate node code.', 'error');
    }
}

function showCodeTab(tab) {
    const codeMap = {
        'main': generatedCode.main || 'Generate a node to see the main file',
        'init': generatedCode.init || 'Generate a node to see __init__.py',
        'requirements': generatedCode.requirements || 'Generate a node to see requirements.txt',
        'installer': generatedCode.installer || 'Generate a node to see install.py'
    };
    
    codeContent.textContent = codeMap[tab];
}

function selectAllFields() {
    const checkboxes = fieldsContainer.querySelectorAll('.field-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        selectedFields.add(checkbox.dataset.field);
    });
    updateNodePreview();
}

function selectNoneFields() {
    const checkboxes = fieldsContainer.querySelectorAll('.field-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        selectedFields.delete(checkbox.dataset.field);
    });
    selectedFields.clear();
    updateNodePreview();
}

function updateNodePreview() {
    if (!parsedApiData || selectedFields.size === 0) {
        nodePreviewContainer.innerHTML = '<div class="placeholder-message">Configure your node to see a preview</div>';
        return;
    }

    const nodeName = nodeNameInput.value || 'Fal Model';
    const inputs = Array.from(selectedFields).map(fieldName => {
        const field = parsedApiData.parameters[fieldName];
        const socketClass = field.required ? 'required' : 'optional';
        const socketType = getSocketType(field.type);
        
        return `
            <div class="socket ${socketClass}">
                <div class="socket-dot ${socketType}"></div>
                <span>${fieldName} (${field.type})</span>
            </div>
        `;
    }).join('');

    const outputType = getSocketType(parsedApiData.outputType);
    
    const previewHtml = `
        <div class="node-preview">
            <div class="node-title">${nodeName}</div>
            <div class="node-inputs">
                <h4>Inputs</h4>
                ${apiKeyHandlingSelect.value === 'input' ? `
                    <div class="socket required">
                        <div class="socket-dot string"></div>
                        <span>api_key (STRING)</span>
                    </div>
                ` : ''}
                ${inputs}
            </div>
            <div class="node-outputs">
                <h4>Outputs</h4>
                <div class="socket">
                    <div class="socket-dot ${outputType}"></div>
                    <span>${parsedApiData.outputType.toLowerCase()} (${parsedApiData.outputType})</span>
                </div>
            </div>
        </div>
    `;
    
    nodePreviewContainer.innerHTML = previewHtml;
}

function getSocketType(type) {
    const typeMap = {
        'STRING': 'string',
        'INT': 'int',
        'FLOAT': 'float',
        'BOOLEAN': 'boolean',
        'ENUM': 'string',
        'IMAGE': 'image',
        'VIDEO': 'video',
        'AUDIO': 'audio'
    };
    return typeMap[type] || 'string';
}

function showIndividualFiles() {
    const files = [
        { name: `${toSnakeCase(nodeNameInput.value || 'fal_model')}.py`, key: 'main' },
        { name: '__init__.py', key: 'init' },
        { name: 'requirements.txt', key: 'requirements' },
        { name: 'install.py', key: 'installer' },
        { name: 'README.md', key: 'readme' }
    ];

    if (generatedCode.config) {
        files.push({ name: 'config.ini', key: 'config' });
    }

    const fileListHtml = files.map(file => `
        <div class="file-item">
            <span class="file-name">${file.name}</span>
            <a href="#" class="file-download" data-file="${file.key}" data-filename="${file.name}">Download</a>
        </div>
    `).join('');

    fileList.innerHTML = fileListHtml;
    individualFilesSection.style.display = 'block';

    // Add download listeners
    fileList.querySelectorAll('.file-download').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const fileKey = e.target.dataset.file;
            const filename = e.target.dataset.filename;
            downloadFile(generatedCode[fileKey], filename);
        });
    });
}

function showInstallationInstructions() {
    const config = {
        nodeName: nodeNameInput.value || 'Fal Model',
        apiKeyHandling: apiKeyHandlingSelect.value
    };

    const folderName = toSnakeCase(config.nodeName);

    const instructionsHtml = `
        <div class="installation-instructions">
            <h4>Automatic Installation (Recommended)</h4>
            <ol>
                <li>Download the complete node package using the button above</li>
                <li>Extract the ZIP file to a temporary location</li>
                <li>Run: <code>python install.py</code></li>
                <li>Restart ComfyUI</li>
                ${config.apiKeyHandling === 'config' ? '<li>Edit <code>config.ini</code> and add your Fal.ai API key</li>' : ''}
            </ol>

            <h4>Manual Installation</h4>
            <ol>
                <li>Create directory: <code>ComfyUI/custom_nodes/${folderName}/</code></li>
                <li>Download all individual files to this directory</li>
                <li>Install dependencies: <code>pip install -r requirements.txt</code></li>
                ${config.apiKeyHandling === 'config' ? '<li>Edit <code>config.ini</code> and add your Fal.ai API key</li>' : ''}
                <li>Restart ComfyUI</li>
            </ol>

            <h4>API Key Setup</h4>
            <p>${getApiKeyInstructions(config.apiKeyHandling)}</p>
        </div>
    `;

    installationInstructions.innerHTML = instructionsHtml;
}

function getApiKeyInstructions(handling) {
    switch (handling) {
        case 'input':
            return 'Connect a text primitive with your Fal.ai API key to the "api_key" input of the node.';
        case 'config':
            return 'Edit the config.ini file and replace "your_api_key_here" with your actual Fal.ai API key.';
        case 'embedded':
            return 'Set the FAL_KEY environment variable before starting ComfyUI.';
        default:
            return 'Configure your API key according to your selected method.';
    }
}

function downloadNodePackage() {
    if (!generatedCode.main) {
        showStatus('Please generate a node first.', 'error');
        return;
    }

    const folderName = toSnakeCase(nodeNameInput.value || 'fal_model');
    const zip = new JSZip();

    // Add all files to ZIP
    zip.file(`${folderName}.py`, generatedCode.main);
    zip.file('__init__.py', generatedCode.init);
    zip.file('requirements.txt', generatedCode.requirements);
    zip.file('install.py', generatedCode.installer);
    zip.file('README.md', generatedCode.readme);

    if (generatedCode.config) {
        zip.file('config.ini', generatedCode.config);
    }

    // Generate and download ZIP
    zip.generateAsync({ type: 'blob' }).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName}_comfyui_node.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showStatus(message, type) {
    parseStatus.textContent = message;
    parseStatus.className = `status-message ${type}`;
    parseStatus.style.display = 'block';

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            parseStatus.style.display = 'none';
        }, 5000);
    }
}

function toSnakeCase(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Set default values
    selectedFields = new Set();
    
    // Initialize node preview
    updateNodePreview();
});