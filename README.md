# Fal.ai to ComfyUI Node Generator

A web application that automatically converts Fal.ai API models into production-ready ComfyUI custom nodes with one-click installation.

## Features

✅ **Smart API Documentation Parsing**
- Supports both Markdown and JSON format documentation
- Extracts exact parameter specifications with proper enum values
- Preserves original parameter casing and formatting
- Handles nested objects, arrays, and complex schemas

✅ **Intelligent Field Configuration**
- Visual selection of required vs optional parameters
- Real-time validation and configuration
- Support for all ComfyUI input types (STRING, INT, FLOAT, BOOLEAN, ENUM)
- Custom node naming and categorization

✅ **Advanced ComfyUI Code Generation**
- Generates production-ready Python nodes
- Proper tensor output formatting for images, videos, and audio
- Comprehensive error handling and API integration
- Support for multiple API key handling methods

✅ **One-Click Installation System**
- Complete ZIP package with auto-installer
- Individual file downloads available
- Clear installation instructions
- ComfyUI Manager compatibility

✅ **Real-Time Preview**
- Live node preview with proper socket types
- Code preview with syntax highlighting
- Interactive field selection interface

## Quick Start

1. **Open the Application**
   ```bash
   # Simply open index.html in your web browser
   open index.html
   ```

2. **Parse API Documentation**
   - Paste your Fal.ai API documentation (Markdown or JSON)
   - Click "Parse Documentation"
   - Review extracted parameters

3. **Configure Your Node**
   - Set node name and category
   - Choose API key handling method
   - Select which parameters to include

4. **Generate & Download**
   - Click "Generate ComfyUI Node"
   - Download the complete ZIP package
   - Run the auto-installer or install manually

## Usage Examples

### Example 1: Using Sample FLUX.1 Documentation

1. Copy the contents of `sample-api-docs.md`
2. Paste into the API documentation textarea
3. Parse and configure as desired
4. Generate your ComfyUI node

### Example 2: Using JSON Schema

1. Copy the contents of `sample-api-schema.json`
2. Paste into the API documentation textarea  
3. The parser will automatically detect JSON format
4. Configure and generate your node

## API Key Configuration

### Config File Method (Recommended)
- API key stored in `config.ini` file
- Secure and reusable across restarts
- Easy to update without code changes

### Node Input Method
- API key provided as a node input
- Visible in the workflow
- Good for shared workflows

### Environment Variable Method
- Set `FAL_KEY` environment variable
- Most secure for server deployments
- Invisible to end users

## File Structure

```
├── index.html              # Main application
├── styles.css              # Application styles  
├── script.js               # Core JavaScript functionality
├── sample-api-docs.md      # Sample Markdown documentation
├── sample-api-schema.json  # Sample JSON schema
├── test.html               # Testing page
└── README.md              # This file
```

## Generated Node Structure

When you generate a node, you'll get:

```
generated_node_package.zip
├── node_name.py           # Main ComfyUI node implementation
├── __init__.py            # ComfyUI integration
├── requirements.txt       # Python dependencies
├── config.ini            # API key configuration (if selected)
├── install.py            # Auto-installer script
└── README.md             # Installation and usage instructions
```

## Installation of Generated Nodes

### Automatic Installation (Recommended)
1. Download and extract the ZIP package
2. Run: `python install.py`
3. Restart ComfyUI
4. Configure API key if needed

### Manual Installation
1. Create folder in `ComfyUI/custom_nodes/your_node_name/`
2. Copy all files to this folder
3. Run: `pip install -r requirements.txt`
4. Configure API key if needed
5. Restart ComfyUI

## Supported Output Types

- **Images**: Converted to ComfyUI IMAGE tensors (compatible with Save Image)
- **Videos**: Converted to ComfyUI VIDEO tensors (compatible with Save Video)
- **Audio**: Converted to ComfyUI AUDIO tensors (compatible with audio nodes)
- **Text**: Standard STRING output type

## Technical Details

### Tensor Format Requirements
- **Images**: `(batch=1, height, width, channels=3)` with values 0.0-1.0
- **Videos**: `(batch=1, frames, height, width, channels=3)` with values 0.0-1.0  
- **Audio**: Appropriate audio tensor format for ComfyUI

### Dependencies
- `fal-client`: Fal.ai API client
- `torch`: PyTorch for tensor operations
- `numpy`: Numerical operations
- `Pillow`: Image processing
- `requests`: HTTP requests
- `opencv-python`: Video processing (for video outputs)
- `librosa` & `soundfile`: Audio processing (for audio outputs)

## Testing

Open `test.html` in your browser to run basic functionality tests.

## Troubleshooting

### Common Issues

**Node doesn't appear in ComfyUI**
- Ensure you restarted ComfyUI after installation
- Check the console for import errors
- Verify all dependencies are installed

**API authentication errors**
- Check your API key configuration
- Ensure you have a valid Fal.ai account
- Verify internet connectivity

**Import/dependency errors**
- Run `pip install -r requirements.txt` manually
- Check Python version compatibility
- Ensure ComfyUI environment is active

### Getting Help

1. Check the ComfyUI console for detailed error messages
2. Verify your API documentation format is supported
3. Test with the provided sample documentation first
4. Ensure all dependencies are properly installed

## Browser Compatibility

- Chrome/Chromium 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Contributing

This is a standalone web application that runs entirely in the browser. To modify or extend:

1. Edit `script.js` for core functionality
2. Update `styles.css` for styling changes
3. Modify `index.html` for UI structure changes
4. Test with `test.html` before deploying

## License

This project is designed for educational and development purposes. Ensure compliance with Fal.ai's terms of service when using their APIs.

---

**Generated nodes are production-ready and include:**
- Comprehensive error handling
- Proper ComfyUI integration  
- Tensor format compatibility
- Security best practices
- Clear documentation

Happy node generating! 🚀