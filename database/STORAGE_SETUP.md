# Supabase Storage Setup for Inventory Images

To enable image uploads for inventory items, you need to create a storage bucket in Supabase.

## Steps:

1. **Go to Supabase Dashboard** → **Storage**

2. **Create a new bucket:**
   - Click "New bucket"
   - Name: `inventory-images`
   - Make it **Public** (so images can be accessed via URL)
   - Click "Create bucket"

3. **Set up bucket policies:**
   - Go to **Storage** → **Policies** → `inventory-images`
   - Add the following policies:

   **Policy 1: Allow authenticated users to upload**
   ```sql
   CREATE POLICY "Allow authenticated uploads"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'inventory-images');
   ```

   **Policy 2: Allow authenticated users to update**
   ```sql
   CREATE POLICY "Allow authenticated updates"
   ON storage.objects FOR UPDATE
   TO authenticated
   USING (bucket_id = 'inventory-images');
   ```

   **Policy 3: Allow public read access**
   ```sql
   CREATE POLICY "Public read access"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'inventory-images');
   ```

   **Policy 4: Allow authenticated users to delete**
   ```sql
   CREATE POLICY "Allow authenticated deletes"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (bucket_id = 'inventory-images');
   ```

4. **Test the setup:**
   - Try uploading an image when creating a new inventory item
   - The image should appear in the items list

## File Size Limits:
- Maximum file size: 5MB (enforced in the UI)
- Supported formats: JPG, PNG, GIF, WebP, etc.

## Notes:
- Images are stored in the `inventory/` folder within the bucket
- Each image gets a unique filename based on item ID and timestamp
- Old images are automatically deleted when items are updated with new images

