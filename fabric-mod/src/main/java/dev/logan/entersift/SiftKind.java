package dev.logan.entersift;

/** Every registered Sift creature and its tuning. Models/textures come from tools/creatures.py. */
public enum SiftKind {
    //         id                hostile aggro  floats  width height health speed dmg  shadow
    BLUB("blub",                 false, false, false, 0.7f, 0.6f,  8,  0.28, 0,   0.4f),
    SCULKER("sculker",           true,  false, false, 0.8f, 1.5f,  26, 0.25, 5,   0.5f),
    SCULKLING("sculkling",       false, false, false, 0.5f, 0.6f,  8,  0.3,  0,   0.3f),
    ANTLERLING("antlerling",     false, false, false, 0.6f, 1.6f,  16, 0.24, 0,   0.4f),
    DRIFT_JELLY("drift_jelly",   false, false, true,  0.7f, 1.4f,  10, 0.12, 0,   0.0f),
    LICKER("licker",             true,  true,  false, 0.9f, 1.1f,  24, 0.27, 4,   0.6f),
    OVERSEER("overseer",         true,  true,  true,  1.0f, 2.6f,  60, 0.18, 6,   0.0f),
    TWISTED_WARDEN("twisted_warden", true, true, false, 1.2f, 3.1f, 300, 0.30, 18, 1.1f),
    SINGER("singer",             false, false, true,  0.6f, 2.6f,  80, 0.0,  0,   0.0f);

    public final String id;
    public final boolean hostile, aggressive, floats;
    public final float width, height, shadow;
    public final double health, speed, damage;

    SiftKind(String id, boolean hostile, boolean aggressive, boolean floats, float width, float height,
             double health, double speed, double damage, float shadow) {
        this.id = id; this.hostile = hostile; this.aggressive = aggressive; this.floats = floats;
        this.width = width; this.height = height; this.health = health; this.speed = speed; this.damage = damage; this.shadow = shadow;
    }
}
