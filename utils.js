const cloudinary = require("cloudinary").v2;

// Helper function to replace local image paths with Cloudinary URLs
async function replaceLocalImagesWithCloudinary(content) {
  const imgTagRegex = /<img src="([^"]+)"/g;
  let match;
  let updatedContent = content;

  while ((match = imgTagRegex.exec(content)) !== null) {
    const localPath = match[1];
    if (localPath.startsWith("data:image/")) {
      const uploadResult = await cloudinary.uploader.upload(localPath, {
        folder: "blog_images",
      });
      const cloudinaryUrl = uploadResult.secure_url;
      updatedContent = updatedContent.replace(localPath, cloudinaryUrl);
    }
  }

  return updatedContent;
}

module.exports = { replaceLocalImagesWithCloudinary };
