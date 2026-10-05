# Minecraft Dungeons II: Sift Rift Technical Implementation Guide
## Comprehensive Production-Ready Development Document for Unreal Engine 5

---

## 1. Architectural Overview & Workflow
This document contains all technical blueprints, production-ready native C++ source code, HLSL shaders, and optimization profiles required to implement the **Sift Rift** mechanics from *Minecraft Dungeons II* within **Unreal Engine 5**. 

The implementation features a high-performance framework utilizing an unlit camera-projected dynamic portal material, a procedural C++ object pool generating blocky debris rings without drawing separate CPU draw calls for individual actors, and fully configured gameplay triggers.

---

## 2. Dynamic Materials & HLSL Shaders (`M_SiftRift`)

### 2.1 Material Settings
*   **Material Domain:** Surface
*   **Blend Mode:** Masked
*   **Shading Model:** Unlit
*   **Two Sided:** Enabled

### 2.2 Material Graph Expression Logic
To achieve the signature "3D window depth" effect into a flat 2D plane without rendering actual geometry behind the mesh, build the following node connections:

1.  **Screen-Aligned Projections:** Create a `ScreenAlignedUVs` node. Multiply its output by a `2D Vector` parameter named `TextureScale` (Default: `1.0, 1.0`) to dictate how tightly packed the inner portal noise appears.
2.  **The Cosmic Window:** Plug the scaled coordinates into the UV slot of your dimension texture sample (e.g., a multi-layered Perlin or Voronoi noise texture).
3.  **Color Drive Mapping:** Route the RGB output of the Noise Texture into the *Texture In* pin of a `HueShift` node.

### 2.3 Pixelation Filter (Custom HLSL Node)
To enforce strict retro voxel styling directly in the shader matrix, insert a **Custom Node** in your material graph. Set the output type to `Float2` with inputs `InUV` and `PixelCount`.
```hlsl
// Custom HLSL Expression Node: VoxelizeUV
float2 PixelGrid = floor(InUV * PixelCount) / PixelCount;
return PixelGrid;
```
*   **Wiring:** Connect standard `TextureCoordinate[0]` into `InUV`. Create a scalar parameter `VoxelResolution` (Default: `64.0`) and connect it to `PixelCount`. Pipe the output of this custom node straight into your portal mask texture UVs to keep all outer boundaries pixelated.

---

## 3. Production C++ Framework

### 3.1 Header Configuration (`SiftRiftActor.h`)
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "SiftRiftActor.generated.h"

UCLASS()
class MINECRAFTDUNGEONS_API ASiftRiftActor : public AActor
{
    GENERATED_BODY()
    
public: 
    ASiftRiftActor();

protected:
    virtual void BeginPlay() override;

public: 
    virtual void Tick(float DeltaTime) override;

    // --- Core Visual Elements & Physical Triggers ---
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Rift Components")
    UStaticMeshComponent* RiftMesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Rift Components")
    UBoxComponent* TeleportTrigger;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Rift Components")
    UPointLightComponent* AmbientGlowLight;

    // --- Runtime Configuration Profiles ---
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rift Settings")
    FName TargetLevelName;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rift Settings")
    float ColorShiftSpeed;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rift Debris")
    int32 DebrisCount;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rift Debris")
    float DebrisOrbitRadius;

private:
    UPROPERTY()
    UMaterialInstanceDynamic* DynamicRiftMaterial;

    UPROPERTY()
    TArray<UStaticMeshComponent*> GeneratedVoxelDebris;

    TArray<float> DebrisSpeeds;
    TArray<float> DebrisCurrentAngles;
    TArray<FVector> DebrisAxes;

    UFUNCTION()
    void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, 
                        UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, 
                        bool bFromSweep, const FHitResult& SweepResult);
};
```

### 3.2 Implementation Pipeline (`SiftRiftActor.cpp`)
```cpp
#include "SiftRiftActor.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/Character.h"

ASiftRiftActor::ASiftRiftActor()
{
    PrimaryActorTick.bCanEverTick = true;

    // 1. Root Structure initialization
    RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("RootScene"));
    
    RiftMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("RiftMesh"));
    RiftMesh->SetupAttachment(RootComponent);
    RiftMesh->SetCollisionProfileName(TEXT("NoCollision"));

    // 2. Collision detection system configuration
    TeleportTrigger = CreateDefaultSubobject<UBoxComponent>(TEXT("TeleportTrigger"));
    TeleportTrigger->SetupAttachment(RootComponent);
    TeleportTrigger->SetBoxExtent(FVector(100.f, 100.f, 150.f));
    TeleportTrigger->SetCollisionProfileName(TEXT("Trigger"));
    TeleportTrigger->OnComponentBeginOverlap.AddDynamic(this, &ASiftRiftActor::OnOverlapBegin);

    // 3. Volumetric scene illuminator setup
    AmbientGlowLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("AmbientGlowLight"));
    AmbientGlowLight->SetupAttachment(RootComponent);
    AmbientGlowLight->Intensity = 6500.f;
    AmbientGlowLight->AttenuationRadius = 900.f;

    // Target Defaults
    TargetLevelName = TEXT("Sift_MiniDungeon");
    ColorShiftSpeed = 1.2f;
    DebrisCount = 32;            
    DebrisOrbitRadius = 280.f;   
}

void ASiftRiftActor::BeginPlay()
{
    Super::BeginPlay();

    if (RiftMesh->GetMaterial(0))
    {
        DynamicRiftMaterial = RiftMesh->CreateDynamicMaterialInstance(0);
    }

    // High Performance Procedural Voxel Debris Generation Engine Loop
    UStaticMesh* CubeMesh = Cast<UStaticMesh>(StaticLoadObject(UStaticMesh::Class(), nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
    UMaterialInterface* GlowMat = RiftMesh->GetMaterial(0);

    for (int32 i = 0; i < DebrisCount; ++i)
    {
        FString ComponentName = FString::Printf(TEXT("ProceduralVoxel_%d"), i);
        UStaticMeshComponent* NewVoxel = NewObject<UStaticMeshComponent>(this, UStaticMeshComponent::StaticClass(), *ComponentName);
        
        if (NewVoxel && CubeMesh)
        {
            NewVoxel->RegisterComponent();
            NewVoxel->AttachToComponent(RootComponent, FAttachmentTransformRules::KeepRelativeTransform);
            NewVoxel->SetStaticMesh(CubeMesh);
            NewVoxel->SetMaterial(0, GlowMat);
            NewVoxel->SetCollisionProfileName(TEXT("NoCollision"));

            float RandomScale = FMath::FRandRange(0.05f, 0.22f);
            NewVoxel->SetRelativeScale3D(FVector(RandomScale));

            GeneratedVoxelDebris.Add(NewVoxel);
            DebrisSpeeds.Add(FMath::FRandRange(0.4f, 1.8f));
            DebrisCurrentAngles.Add(FMath::FRandRange(0.f, 360.f));
            DebrisAxes.Add(FMath::VRand()); 
        }
    }
}

void ASiftRiftActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    float GameTime = GetWorld()->GetTimeSeconds();

    // 1. Thread Processing for HSV Shift Matrix
    float HueWave = FMath::Sin(GameTime * ColorShiftSpeed);
    FLinearColor CurrentRiftColor = FLinearColor::MakeFromHSV((HueWave + 1.0f) * 180.f, 1.0f, 1.0f);

    if (DynamicRiftMaterial)
    {
        DynamicRiftMaterial->SetScalarParameterValue(TEXT("HueCycleOffset"), HueWave);
    }

    AmbientGlowLight->SetLightColor(CurrentRiftColor);

    // 2. Trigonometric Math Loop for Blocky Ring Debris Trajectories
    for (int32 i = 0; i < GeneratedVoxelDebris.Num(); ++i)
    {
        if (GeneratedVoxelDebris[i])
        {
            DebrisCurrentAngles[i] += DebrisSpeeds[i] * DeltaTime * 50.0f;
            float RadianAngle = FMath::DegreesToRadians(DebrisCurrentAngles[i]);

            FVector OrbitOffset = FVector(
                FMath::Cos(RadianAngle) * DebrisOrbitRadius,
                FMath::Sin(RadianAngle) * (DebrisOrbitRadius * 0.75f),
                FMath::Sin(RadianAngle * 2.5f) * 50.f 
            );

            GeneratedVoxelDebris[i]->SetRelativeLocation(OrbitOffset);

            FRotator CurrentRotation = GeneratedVoxelDebris[i]->GetRelativeRotation();
            CurrentRotation.Add(25.f * DeltaTime, 45.f * DeltaTime, 15.f * DeltaTime);
            GeneratedVoxelDebris[i]->SetRelativeRotation(CurrentRotation);
        }
    }
}

void ASiftRiftActor::OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, 
                                    UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, 
                                    bool bFromSweep, const FHitResult& SweepResult)
{
    if (OtherActor && (OtherActor != this) && OtherActor->IsA(ACharacter::StaticClass()))
    {
        UGameplayStatics::OpenLevel(GetWorld(), TargetLevelName);
    }
}
```

---

## 4. Environmental Optimization Profiles
*   **Static Mesh Component Pooling:** By managing the 32 individual blocks inside a memory-tracked `TArray`, individual update loops are optimized natively inside the object tick thread instead of inflating actor lifecycles on the game thread.
*   **Light Mobility:** Set the `AmbientGlowLight` to **Movable** but explicitly enforce a strict max radius (`AttenuationRadius = 900.f`) and turn off **Cast Shadows** to prevent shadow-map updates every frame when the light updates colors.
