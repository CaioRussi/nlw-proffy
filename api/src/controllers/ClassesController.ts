import { Request, Response } from 'express';

import db from "../database/connection";
import convertHourToMinutes from '../utils/convertHourToMinutes';

type ScheduleItem = {
    week_day: number,
    from: string,
    to: string,
};

export default class ClassesController {

    public async create (request: Request, response: Response) {
        const { name, avatar, whatsapp, biography, subject, cost, schedule } = request.body;
    
        let transaction = await db.transaction();
        try {
    
            const userIds = await transaction('users').insert({
                name, 
                avatar, 
                whatsapp, 
                biography,
            });
    
            const classesIds = await transaction('classes').insert({
                subject, 
                cost,
                user_id: userIds[0],
            });
    
            const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
                return {
                    week_day: scheduleItem.week_day,
                    from: convertHourToMinutes(scheduleItem.from),
                    to: convertHourToMinutes(scheduleItem.to),
                    class_id: classesIds[0],
                }
            });
    
            await transaction('class_schedule').insert(
                classSchedule,
            );
    
            await transaction.commit();
    
            return response.status(201).send();
        } catch (error) {
            await transaction.rollback();
    
            console.error(JSON.stringify(error, null, 2));
    
            return response.status(500).json({
                error: 'Unexpected error while creating new class',
            });
        }
    }

    public async list (request: Request, response: Response) {
        const filters = request.query;

        if (!filters.week_day || !filters.subject || !filters.time) {
            return response.status(400).json({
                error: 'Missing filters to search classes',
            });
        }

        const timeInMinutes = convertHourToMinutes(filters.time as string);

        const classes = await db('classes')
                                .whereExists(function() {
                                    this.select('class_schedule.*')
                                        .from('class_schedule')
                                        .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
                                        .whereRaw('`class_schedule`.`week_day` = ??', [Number(filters.week_day)])
                                        .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
                                        .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes])
                                })
                                .where('subject', '=', filters.subject as string)
                                .join('users', 'classes.user_id', '=', 'users.id')
                                .select(['classes.*', 'users.*']);

        return response.send(classes);
    }
}