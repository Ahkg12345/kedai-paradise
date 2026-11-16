import { readFile, stat } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading demo menu photos.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const photos = [
  { file: 'mie-goreng.png', object: 'menu/4db73457-439d-42f2-ad6a-863312bd56a9.png' },
  { file: 'kopi-susu.png', object: 'menu/02e60daf-387b-4722-9311-a1066a5ae9ba.png' },
  { file: 'es-teh.png', object: 'menu/7e041cff-3b46-4841-a974-7d16949a1abd.png' },
  { file: 'roti-bakar.png', object: 'menu/5b29e664-e666-49a0-b15e-2540de0adae7.png' },
  { file: 'nasi-goreng.png', object: 'menu/78194ca5-2ae4-4165-be63-9f68ae1e7db0.png' },
  { file: 'teh-hangat.png', object: 'menu/0a4f5f8d-b223-482e-ac43-f93d30c76dee.png' },
  { file: 'kentang-goreng.png', object: 'menu/c336a055-ead4-44ef-a2d8-4ef3333b3403.png' },
]

for (const photo of photos) {
  const localPath = new URL(`./demo-menu-assets/${photo.file}`, import.meta.url)
  const image = await readFile(localPath)
  const imageInfo = await stat(localPath)

  if (imageInfo.size > 1_048_576) {
    throw new Error(`${photo.file} exceeds the 1 MB menu bucket limit.`)
  }
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${photo.file} is not a PNG image.`)
  }

  const { error } = await supabase.storage.from('menu').upload(photo.object, image, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`Unable to upload ${photo.file}: ${error.message}`)
}

console.log(`Uploaded ${photos.length} demo menu photos to the private menu bucket.`)
