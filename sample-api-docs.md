# FLUX.1 [schnell] Image Generation

Generate high-quality images using FLUX.1 schnell model.

## API Endpoint

POST https://fal.run/fal-ai/flux/schnell

## Parameters

- `prompt` (string, required): The text prompt to generate an image from. Maximum 512 characters.

- `image_size` (string, optional): The size of the generated image. Options: ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"]. Default: "landscape_4_3"

- `num_inference_steps` (integer, optional): Number of denoising steps. Range: 1-4. Default: 4

- `seed` (integer, optional): Random seed for reproducible generation. Range: 0-2147483647

- `enable_safety_checker` (boolean, optional): Whether to enable safety checker to filter out harmful content. Default: true

- `sync_mode` (boolean, optional): Whether to run in synchronous mode. Default: true

## Response

Returns an object with:
- `images`: Array of generated image objects
  - `url`: Direct URL to the generated image
  - `width`: Image width in pixels
  - `height`: Image height in pixels
- `timings`: Processing time information
- `seed`: The seed used for generation

## Example

```python
import fal_client

result = fal_client.submit(
    "fal-ai/flux/schnell",
    arguments={
        "prompt": "A beautiful landscape with mountains and a lake",
        "image_size": "landscape_16_9",
        "num_inference_steps": 4,
        "seed": 42
    }
).get()

print(result["images"][0]["url"])
```