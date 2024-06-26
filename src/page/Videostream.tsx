import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { useEffect, useRef, useState } from 'react';
import { ExplorationRepository, ICreateExplorationArgDto } from '../feature/exploration/exploration';
import { StreamRepository } from '../feature/stream/repository/StreamRepository';
import { IPostObjectDetectionArgDto } from '../feature/stream/model/VideoStream';
import { Button, Form, Modal } from 'react-bootstrap';

const Videostream = () => {
    const [explorationName, setExplorationName] = useState<string|null>(null);
    const explorationId = useRef<string|null>(null);

    const [imageBlob, setImageBlob] = useState<any|null>(null);
    const [imageBlobDet, setImageBlobDet] = useState<any|null>(null); // Image Blob for object detection
    const imageBlobDetBase64 = useRef<any|null>(null); // Image Blob for object detection
    const oldImageBlobDetBase64 = useRef<any|null>(null); 

    const client = useRef<MqttClient | null>(null);
    const [irValue, setIrValue] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState<string | null>(null);
    const [humidValue, setHumidValue] = useState<string | null>(null);
    const [gasValue, setGasValue] = useState<string | null>(null);

    const [showModal, setShowModal] = useState(false);

    const options = {
        protocol: 'mqtt',
        host: `${import.meta.env.VITE_BROKER_HOST}`,
        port: parseInt(`${import.meta.env.VITE_BROKER_PORT}`),
        clientId: generateRandomClientId(),
        username: `${import.meta.env.VITE_BROKER_USERNAME}`,
        password: `${import.meta.env.VITE_BROKER_PASSWORD}`,
    };

    const subsTopics = [
        `${import.meta.env.VITE_IR_TOPIC}`,
        `${import.meta.env.VITE_TEMP_TOPIC}`,
        `${import.meta.env.VITE_HUMID_TOPIC}`,
        `${import.meta.env.VITE_GAS_TOPIC}`,
        `${import.meta.env.VITE_STREAM_SEND_TOPIC}`,
        `${import.meta.env.VITE_STREAM_RECEIVE_TOPIC}`,
    ];

    useEffect(() => {
        if (explorationName === null) {
            return;
        }

        const createExplorationArg: ICreateExplorationArgDto = {
            name: explorationName
        };

        ExplorationRepository.getInstance()
            .createExploration(createExplorationArg)
            .then((res) => {
                explorationId.current = res.explorationId;
            })
            .catch((err) => {
                alert("Exploration failed to be created. The page will be reloaded.");
                window.location.reload();
            });
    }, [explorationName]);

    useEffect(() => {
        client.current = mqtt.connect(options as IClientOptions);

        client.current.on('connect', () => {
            console.log('Connected');
        });

        client.current.on('error', (err: Error | mqtt.ErrorWithReasonCode) => {
            console.error(`Connection error: ${err}`);

            client.current?.end();
        });

        client.current.on('reconnect', () => {
            console.log('Reconnecting');
        });
        
        client.current.on('message', (topic: string, message: Buffer) => {
            const messageStr = message.toString();

            switch (topic) {
                case `${import.meta.env.VITE_IR_TOPIC}`:
                    setIrValue(messageStr);
                    break;

                case `${import.meta.env.VITE_TEMP_TOPIC}`:
                    setTempValue(messageStr);
                    break;

                case `${import.meta.env.VITE_HUMID_TOPIC}`:
                    setHumidValue(messageStr);
                    break;

                case `${import.meta.env.VITE_GAS_TOPIC}`:
                    setGasValue(messageStr);
                    break;
                
                case `${import.meta.env.VITE_STREAM_SEND_TOPIC}`:
                    const blob = new Blob([message], { type: 'image/jpeg' }); 
                    setImageBlob(blob);
                    break;

                case `${import.meta.env.VITE_STREAM_RECEIVE_TOPIC}`:
                    const blobObj = new Blob([message], { type: 'image/jpeg' }); 
                    setImageBlobDet(blobObj);

                    imageBlobDetBase64.current = message.toString('base64');

                    break;

                default:
                    break;
            }
        });

        return () => {
            client.current?.end();
        };
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (explorationId.current === null || imageBlobDetBase64.current === oldImageBlobDetBase64.current) {
                return;
            }

            const postObjectDetectionArg: IPostObjectDetectionArgDto = {
                exploration_id: explorationId.current,
                image_blob: imageBlobDetBase64.current,
            }

            StreamRepository.getInstance()
                .postObjectDetection(postObjectDetectionArg)
                .then(() => {
                    console.log(`Object detection was successfully posted.`);

                    oldImageBlobDetBase64.current = postObjectDetectionArg.image_blob;
                })
                .catch((err) => {
                    alert("Object detection was failed to be posted.");
                });
        }, 10000); // in ms
    
        return () => {
            clearInterval(intervalId);
        }
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'w':
                    publishControlTopic('forward');
                    break;
                case 'a':
                    publishControlTopic('left');
                    break;
                case 'x':
                    publishControlTopic('backward');
                    break;
                case 'd':
                    publishControlTopic('right');
                    break;
                case 's':
                    publishControlTopic('stop');
                    break;
                default:
                    break;
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
    
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    function randomString(length: number) {
        let chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        
        for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
        
        return result;
    }

    function generateRandomClientId() {
        return 'mqtt_iyoti_' + randomString(10);
    }

    const sendMessage = (message: string) => {
        if (client.current === null || client.current.disconnected) {
            return;
        }

        client.current.publish(`${import.meta.env.VITE_STREAM_CONTROL_TOPIC}`, message, (error?: Error) => {
            if (error) {
                alert(`Publish stream control error`);
            }
        });
    }

    const subscribeToAllTopics = () => {
        if (client.current === null || client.current.disconnected) {
            return;
        }

        subsTopics.forEach(topic => {
            client.current!.subscribe(topic, (err: Error | null) => {
                if (err) {
                    alert(`Error on subscribing '${topic}' topic. The page will be reloaded.`);
                    window.location.reload();
                }
            });
        });
    }

    const unsubscribeFromAllTopics = () => {
        if (client.current === null || client.current.disconnected) {
            return;
        }
    
        subsTopics.forEach(topic => {
            client.current!.unsubscribe(topic, (err?: Error) => {
                if (err) {
                    alert(`Error on unsubscribing '${topic}' topic. The page will be reloaded.`);
                    window.location.reload();
                }
            });
        });
    };

    const handleStartClick = () => {
        setShowModal(true);

        subscribeToAllTopics();
        sendMessage("p");
    };

    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const inputName = formData.get('explorationName') as string;

        setExplorationName(inputName);
        
        setShowModal(false);
    };

    const handleStopClick = () => {
        sendMessage("s");
        unsubscribeFromAllTopics();

        setImageBlob(null);
        setImageBlobDet(null);
    };

    const publishControlTopic = (keyInput: 'forward' | 'backward' | 'left' | 'right' | 'stop') => {
        if (client.current === null || client.current.disconnected) {
            return;
        }

        client.current.publish(`${import.meta.env.VITE_ROBOT_CONTROL_TOPIC}`, keyInput, (error?: Error) => {
            if (error) {
                alert(`Publish robot control error`);
            }
        });
    }

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.readAsDataURL(blob);

            reader.onloadend = () => {
                resolve(reader.result as string);
            };

            reader.onerror = reject;
        });
    };

    return (
        <div className="container py-2">
            <div className="row">
                <section className="col">
                    <div className="d-flex flex-column gap-3">
                        <h1 className="d-flex justify-content-center">Live Video Stream</h1>
                        <div className="d-flex justify-content-center gap-2">
                            <Button variant="primary" onClick={handleStartClick}>Start</Button>
                            <Button variant="danger" onClick={handleStopClick}>Stop</Button>
                        </div>
                        {imageBlob && (
                            <div className="d-flex flex-column align-items-center gap-3">
                                <div className="d-flex justify-content-center">
                                    <img src={URL.createObjectURL(imageBlob)} alt="Blob Image" />
                                </div> 
                                <div>
                                    <div className='d-flex justify-content-between gap-5'>
                                        <div>IR</div>
                                        <div>{irValue !== null ? irValue : '-'}</div>
                                    </div>
                                    <div className='d-flex justify-content-between gap-5'>
                                        <div>Temperature</div>
                                        <div
                                            style={{ 
                                                color: (tempValue !== null && parseInt(tempValue) > 50) ? 'red' : 'inherit', 
                                                fontWeight: (tempValue !== null && parseInt(tempValue) > 50) ? 'bold' : 'normal' 
                                            }}
                                        >
                                            {tempValue !== null ? tempValue : '-'}
                                        </div>
                                    </div>
                                    <div className='d-flex justify-content-between gap-5'>
                                        <div>Humidity</div>
                                        <div>{humidValue !== null ? humidValue : '-'}</div>
                                    </div>
                                    <div className='d-flex justify-content-between gap-5'>
                                        <div>Gas</div>
                                        <div
                                            style={{ 
                                                color: gasValue !== null && parseInt(gasValue) === 1 ? 'red' : 'inherit', 
                                                fontWeight: gasValue !== null && parseInt(gasValue) === 1 ? 'bold' : 'normal' 
                                            }}
                                        >
                                            {gasValue !== null ? gasValue : '-'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="d-flex flex-column align-items-center gap-3 mt-3">
                        <h1>Controller</h1>
                        <div className='d-flex gap-2'>
                            <Button variant={"secondary"} onClick={() => publishControlTopic('forward')}>Forward</Button>
                            <Button variant={"secondary"} onClick={() => publishControlTopic('backward')}>Backward</Button>
                            <Button variant={"secondary"} onClick={() => publishControlTopic('left')}>Left</Button>
                            <Button variant={"secondary"} onClick={() => publishControlTopic('right')}>Right</Button>
                            <Button variant={"secondary"} onClick={() => publishControlTopic('stop')}>Stop</Button>
                        </div>
                    </div>
                </section>

                <section className="col">
                    <div className="d-flex flex-column align-items-center gap-3">
                        <h1>Object Detection</h1>
                        <div className="d-flex justify-content-center gap-2" style={{ visibility: 'hidden' }}>
                            <Button variant="primary">Start</Button>
                            <Button variant="danger">Stop</Button>
                        </div>
                        {imageBlobDet && (
                            <div>
                                <div className="d-flex justify-content-center">
                                    <img src={URL.createObjectURL(imageBlobDet)} alt="Blob Image Detection" />
                                </div> 
                            </div>
                        )}
                    </div>
                </section>

                <Modal show={showModal} onHide={() => setShowModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>Robot Exploration</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form onSubmit={handleFormSubmit}>
                            <Form.Group controlId="formName">
                                <Form.Label>Name</Form.Label>
                                <Form.Control type="text" name="explorationName" required />
                            </Form.Group>
                            <Button variant="primary" type="submit" className='mt-3'>
                                Create
                            </Button>
                        </Form>
                    </Modal.Body>
                </Modal>
            </div>
        </div>
    );
}

export default Videostream;