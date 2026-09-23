import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.js";
import fs from "fs";

class R2Service {
  constructor() {
    this.client = null;
    this.initClient();
  }

  initClient() {
    const { accountId, accessKeyId, secretAccessKey, endpoint } = config.r2;
    if (accessKeyId && secretAccessKey && (accountId || endpoint)) {
      const s3Endpoint = endpoint || `https://${accountId}.r2.cloudflarestorage.com`;
      this.client = new S3Client({
        region: "auto",
        endpoint: s3Endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  isConfigured() {
    return Boolean(
      this.client &&
      config.r2.bucketName &&
      config.r2.accessKeyId &&
      config.r2.secretAccessKey
    );
  }

  async uploadFile({ key, filePath, contentType }) {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare R2 is not configured.");
    }
    const fileStream = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: fileStream,
      ContentType: contentType || "application/octet-stream",
    });
    return await this.client.send(command);
  }

  async uploadBuffer({ key, buffer, contentType }) {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare R2 is not configured.");
    }
    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    });
    return await this.client.send(command);
  }

  async getPresignedUploadUrl({ key, contentType, expiresIn = 3600 }) {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare R2 is not configured.");
    }
    const command = new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }

  async getPresignedDownloadUrl({ key, expiresIn = 14400 }) {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare R2 is not configured.");
    }
    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }

  async objectExists(key) {
    if (!this.isConfigured()) return false;
    try {
      const command = new HeadObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      return false;
    }
  }

  async deleteObject({ key }) {
    if (!this.isConfigured()) return;
    const command = new DeleteObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    return await this.client.send(command);
  }

  getPublicUrl(key) {
    if (config.r2.publicUrl) {
      const base = config.r2.publicUrl.replace(/\/$/, "");
      const cleanKey = key.startsWith("/") ? key.slice(1) : key;
      return `${base}/${cleanKey}`;
    }
    return null;
  }
}

export const r2Service = new R2Service();
