function updateAI(dt) {
    // 檢查全域變數是否存在
    if (!window.ball || !window.aiCar) return;

    const ballPos = window.ball.body.position;
    const ballVel = window.ball.body.velocity;
    const aiPos = window.aiCar.chassisBody.position;
    const goalZ = 93; // AI 進攻方向 (正 Z)

    // 1. 物理預判 (Prediction)
    const predTime = 0.5; // 預瞄 0.5 秒後
    const predBallPos = {
        x: ballPos.x + ballVel.x * predTime,
        z: ballPos.z + ballVel.z * predTime
    };

    // 2. 決策邏輯
    let targetPos = new CANNON.Vec3(0, 0, 0);
    let targetHeading = { x: 0, z: 0 };
    let finalSpeed = 20;

    // 計算球到球門的向量
    const toGoal = { x: 0 - predBallPos.x, z: goalZ - predBallPos.z };
    const distToGoal = Math.sqrt(toGoal.x * toGoal.x + toGoal.z * toGoal.z);
    const shootDir = { x: toGoal.x / distToGoal, z: toGoal.z / distToGoal };

    // 判斷狀態：球是否在 AI 身後？
    const isBallBehind = aiPos.z > ballPos.z + 5; 
    
    if (isBallBehind) {
        // [防守/回防模式]
        // 移動到球與己方球門 (-93) 之間
        targetPos.set(predBallPos.x * 0.5, 0, predBallPos.z - 20);
        targetHeading = { x: 0, z: 1 }; // 面向前方/球
        finalSpeed = 15;
    } else {
        // [進攻模式]
        // 目標點設在球的後方，並對準球門
        const offsetDist = 8.0;
        targetPos.set(
            predBallPos.x - shootDir.x * offsetDist,
            0,
            predBallPos.z - shootDir.z * offsetDist
        );
        targetHeading = shootDir;
        finalSpeed = 35; // 全速前進
    }
    
    // 防撞牆修正
    if (targetPos.x > 45) targetPos.x = 45;
    if (targetPos.x < -45) targetPos.x = -45;

    // 3. 執行 DriveTo
    const distToTarget = Math.sqrt((targetPos.x - aiPos.x)**2 + (targetPos.z - aiPos.z)**2);
    const time = distToTarget / 30; // 假設平均速度 30

    if (typeof driveTo === 'function') {
        driveTo(window.aiCar, targetPos, targetHeading, finalSpeed, time, dt);
    }

    // 4. 自動跳躍邏輯
    if (ballPos.y > 3.0 && ballPos.y < 12.0) {
        const distToBall = Math.sqrt((ballPos.x - aiPos.x)**2 + (ballPos.z - aiPos.z)**2);
        if (distToBall < 15.0) {
                // 檢查是否面向球
                const q = window.aiCar.chassisBody.quaternion;
                const fwd = new CANNON.Vec3(0,0,-1);
                q.vmult(fwd, fwd);
                const toBall = { x: ballPos.x - aiPos.x, z: ballPos.z - aiPos.z };
                // 點積大於 0 代表球在前方
                if (fwd.x * toBall.x + fwd.z * toBall.z > 0) {
                    if (typeof applyControl === 'function') {
                        applyControl(window.aiCar, 1, 0, false, true, dt, false); // 觸發跳躍
                    }
                }
        }
    }
}